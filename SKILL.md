# 谢尧四平台发视频 Skill

从 SD 卡 raw 视频到抖音/小红书/视频号/B站全链路发布。2026-11-12 定稿，全部环节实战验证过。

## 触发词
"剪视频发四平台""发视频""新录的视频""传到抖音小红书""按流程发片"。

## 环境约定（先验证再动手）
- 工作区：`你的工作区`，发布工具链在 `tools/publish/`（正式脚本，禁止绕过）。
- 浏览器：**9222**=抖音+视频号（Chrome-Agent 默认 profile）；**9334**=小红书+B站（`./start-task-browser.sh test-p0 9334`）。
- 若 9222 启动失败：`open` 无效时用二进制直启 `"$HOME/agent-browser/Chrome-Agent.app/Contents/MacOS/Google Chrome" --user-data-dir="$HOME/.chrome-cdp-profile" --profile-directory="Profile 2" --remote-debugging-port=9222 --no-first-run --mute-audio`。
- 视频号登录会过期，需用户点"微信快捷登录"。
- **所有 CDP 操作必须带 `CDP_TARGET`**（平台 tab 关键字：douyin / channels.weixin / xiaohongshu / bilibili），否则连上 about:blank 空等 25 分钟。

## 全流程（每步有验证点）

### 1. 取片与转写
```bash
ls -lat /Volumes/Untitled/DCIM/DJI_001/*.MP4 | head -3   # 找最新
mkdir -p 素材库/<NN-日期_主题>/{1-原片,2-剪辑,3-工程,4-封面,5-导出}
# 转写（large-v3-turbo，模型路径自行配置）
ffmpeg -y -i 原片 -vn -ar 16000 -ac 1 -c:a pcm_s16le audio.wav
whisper-cli -m ggml-large-v3-turbo.bin -f audio.wav -l zh -osrt -otxt -of sub
```
验证：sub.txt 通读，修转写错字（专有名词、数字、人名）。

### 2. 剪气口（语气词/停顿/换气）
```bash
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 ../1-原片/01-原片.mp4   # 取时长
python3 ~/.agents/skills/xieyao-video-publish/scripts/cut-silences.py audio.wav sub.srt <时长> filter.txt cutplan.json
ffmpeg -y -i 原片 -filter_complex "$(cat filter.txt)" -map "[v]" -map "[a]" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -c:a aac -b:a 160k master-cut.mp4
```
⚠️ ffmpeg 9 **没有 `-filter_complex_script`**，filter 必须内联（命令行长度够）。
⚠️ filter 拼接是 `';'.join(行)` 时，行尾不能再带分号（会产生 `;;` 报错）。

### 3. 字幕（课代表版式专用）
```bash
python3 ~/.agents/skills/xieyao-video-publish/scripts/gen-subtitles-kdb.py sub.srt 字幕-kdb.ass --shift cutplan.json
```
参数固化：72px / Alignment=8（顶部对齐）/ MarginV=1300（人物区下沿，**绝不压蓝条**）/ 11 字断行。

### 4. 渲染课代表版式
```bash
cd tools/publish && python3 gen-kdb.py --video master-cut.mp4 --ass 字幕-kdb.ass \
  --title "白字行|金黄行|灰色署名" --points points.json --out 竖版.mp4
```
布局（1080×1920）：标题区 0-420 墨蓝黑 #101827+香槟金 #D9B36C+右上"深度视频"胶囊；人物区 420-1500 中央方形近景 crop=1080:1080:420:0；要点条 1500-1920 品牌蓝 #0B4FE0 渐变+页码。points.json = 章节要点 4-6 页 `{"start","end","text":"眉题|主文|补充"}`。

### 5. 压缩
```bash
tools/publish/compress-for-upload.sh 竖版.mp4 发布版.mp4   # 2Mbps，3.5min≈55MB
```

### 6. 封面（默认人物版 B）
```bash
ffmpeg -ss <好帧> -i master-cut.mp4 -frames:v 1 -vf "crop=1080:1080:420:0" 人物帧.jpg
python3 ~/.agents/skills/xieyao-video-publish/scripts/gen-cover-person.py --frame 人物帧.jpg \
  --title "腾讯裁员后|谁的钱最好赚？|大厂员工的买课热情，拆开给你看" --ratio 3:4 --out 封面-3x4.jpg
# 同命令出 9:16 / 16:9 / 4:3
```
验证：文字居中、人物脸完整、四比例无切头。

### 7. 四平台发布
manifest 模板见 `tools/publish/manifest.example.json`。分组并行：
- 9222：douyin → channels；9334：xhs → bili。
```bash
cd tools/publish
node publish-all.js --manifest m-A.json --publish   # A: douyin+channels (ports 9222)
node publish-all.js --manifest m-B.json --publish   # B: xhs (9334)
node publish-all.js --manifest m-C.json --publish   # C: bili (9334)
```
publish-all 已带 CDP_TARGET 和端口分组。

**兜底（脚本失败时手动接管，已验证）**：
- 抖音 `scripts/douyin-finish.js 标题 简介 封面`（publish.js 填表卡死时用）。
- 视频号 `scripts/channels-finish.js 封面`（publish-channels.js 封面步骤失败时用；前置：视频/描述/短标题已就绪）。
- 小红书发布按钮在闭合 shadow DOM：publish-xhs.js 已内置 CDP 树穿透点击。
- B站换封面：编辑页 → 点封面缩略图 → 封面制作弹窗（视口必须拉高到 2200 才能看到"完成"）→ 完成 → 立即投稿。

### 8. 验收（全部必做）
```bash
node cover-check.js --platform douyin|xhs|channels|bili --out evidence/xxx.png
```
逐项核对：标题一致、封面是新图、时长对、无重复条。小红书发布后必须查重（脚本曾误判重复发两条）。改封面后必须回列表验收，平台缓存会让旧图看起来"没换上"。

## 已知坑速查
| 坑 | 解法 |
|---|---|
| CDP 连错 tab 空等 | 一切 CDP 调用带 CDP_TARGET |
| 小红书"发布成功但验证判失败" | 已修：发布后先查列表再判；仍要人工查重 |
| B站"投稿成功但列表未收录"误判重发 | 已修：verify 和 publish-all 的 listed 都加 retries（2026-11-13）；**发现重试苗头立刻杀 publish-all 进程**，别等第二次投完（实测重复一条，审核时平台自动消掉） |
| 抖音封面注入不生效 | 发布后必须回列表验收，首帧≠封面时用 douyin-cover-replace.js 补 |
| B站封面编辑器"完成"不可见 | Emulation 视口拉到 2200 |
| 视频号登录过期 | 用户点微信快捷登录 |
| 浏览器官死 | lsof -ti:端口 kill -9 后重启；9222 用二进制直启 |

## 标题与封面规范
见 `tools/publish/标题与封面规则.md`：课代表式标题（断言/反问+数字/极端词+悬念）、品牌色（#0B4FE0 等 5 色）、封面图台账（禁止重复用图）。

## 红线
- 不删视频、不删笔记（删需用户点名）。
- 发布前 manifest 缺封面直接退出；封面失败不发布。
- 任何"以为卡死"不得杀进程重传，先回列表查重。
