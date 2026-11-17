# 谢尧四平台发视频 Skill

从 SD 卡 raw 视频到抖音/小红书/视频号/B站全链路发布的 AI Agent Skill。2026-11 在真实账号上连续实战验证（4 条视频、16 次发布）。

## 这是什么

一个可复用的发视频工作流，覆盖 8 个环节：

```
取片 → 转写(whisper) → 剪气口 → 字幕 → 课代表版式渲染 → 压缩 → 封面 → 四平台发布+验收
```

沉淀的核心资产：
- **剪气口脚本**：静音检测 + 纯语气词删除，自动生成 ffmpeg filter（5 分钟口播剪掉 10-50 秒废片）
- **课代表版式**（gen-kdb.py）：顶部大标题 + 中间人物近景 + 底部品牌蓝要点条（按章节切 4-6 页），让口播视频自带"信息图"密度
- **人物版封面生成器**：文字居中 + 人物实拍帧，四比例一键出
- **发布兜底脚本**：抖音/视频号自动化失败时的一键接管
- **坑清单**：16 次发布踩出来的平台坑（CDP 连错 tab、shadow DOM 按钮、审核误判重发、封面不生效等）

## 安装

```bash
# 1. 放 skill 到本机 skills 目录
cp -r xieyao-video-publish ~/.agents/skills/

# 2. 依赖（macOS）
brew install ffmpeg whisper-cpp   # whisper 模型需自行下载 large-v3-turbo

# 3. 字体（macOS 自带）
# 苹方 /System/Library/AssetsV2/.../PingFang.ttc
```

## 配置

脚本需要两个 **CDP 调试浏览器**（带平台登录态）：

| 端口 | 平台 | 启动方式 |
|---|---|---|
| 9222 | 抖音 + 视频号 | Chrome/Edge `--remote-debugging-port=9222` |
| 9334 | 小红书 + B站 | 第二个 profile 同参数 |

```bash
# 示例：用独立 profile 启动 9222
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir=~/.chrome-cdp-profile --remote-debugging-port=9222
```

**登录态**：先手动在各平台后台登录一次，cookie 存在 profile 里。视频号登录会定期过期，需重新扫码。

## 使用

`SKILL.md` 是完整操作手册（8 步流程 + 每步验证点 + 坑速查）。核心命令：

```bash
# 剪气口（生成 filter.txt + cutplan.json）
python3 scripts/cut-silences.py audio.wav sub.srt <时长秒> filter.txt cutplan.json

# 课代表版式字幕
python3 scripts/gen-subtitles-kdb.py sub.srt 字幕.ass --shift cutplan.json

# 课代表版式渲染（标题区+人物区+要点条）
python3 scripts/gen-kdb.py --video master-cut.mp4 --ass 字幕.ass \
  --title "白字行|金黄行|署名" --points points.json --out out.mp4

# 人物版封面（四比例）
python3 scripts/gen-cover-person.py --frame 人物帧.jpg \
  --title "主标题|强调行|副题" --ratio 3:4 --out cover.jpg
```

## 各平台要点（坑）

| 平台 | 关键点 |
|---|---|
| 抖音 | 上传判定必须看"视频 CDN 地址+编辑页 URL"；封面注入后必须回列表验收（平台可能不生效） |
| 小红书 | 发布按钮在**闭合 shadow DOM** 里，JS 递归找不到，必须用 CDP 树穿透点击；发布后要查重 |
| 视频号 | 登录态常过期；封面弹窗 input 渲染慢，脚本 sleep 不够要兜底 |
| B站 | 投稿成功但列表收录有延迟，验证逻辑必须加 retries，否则重发造成重复投稿 |


## 完整仓库结构

```
xieyao-video-publish/
├── SKILL.md                 # 8 步流程操作手册（Agent 读这个）
├── README.md                # 本文件：安装与架构
├── scripts/                 # 剪辑侧（Python，无浏览器依赖）
│   ├── cut-silences.py      # 剪气口：静音+语气词检测 → ffmpeg filter
│   ├── gen-subtitles-kdb.py # 课代表版式 ASS 字幕（含剪后时间轴校正）
│   ├── gen-cover-person.py  # 人物版封面，四比例
│   ├── douyin-finish.js     # 抖音兜底（填表卡死时接管）
│   ├── channels-finish.js   # 视频号兜底（封面+发表）
│   └── lib.js               # CDP 连接库
└── tools/publish/           # 发布侧（Node/Python，需 CDP 浏览器）
    ├── gen-kdb.py           # ★课代表版式渲染（标题区+人物+要点条）
    ├── publish-all.js       # 多平台编排（端口分组并行+查重）
    ├── publish.js           # 抖音
    ├── publish-channels.js  # 视频号
    ├── publish-xhs.js       # 小红书
    ├── publish-bili.js      # B站
    ├── publish-guard.js     # 门禁：断言/条件等待/超时阻断
    ├── cover-check.js       # 平台实际缩略图验收
    ├── cover-lint.js        # 封面字号合规检查
    ├── cover-horizontal.py  # 横版封面（原帧铺满+大字）
    ├── cover-kazike.py      # 卡片式封面
    ├── douyin-cover-replace.js  # 抖音换封面
    ├── xhs-cover-replace.js     # 小红书换封面
    ├── compress-for-upload.sh   # 2Mbps 压缩
    ├── preflight.js         # 上传前预检
    ├── test-guard.js        # 工具链自测
    ├── start-cdp.sh / start-task-browser.sh / stop-*.sh  # 浏览器管理
    ├── inject-file.js / inject-image.js / fill-channels.js  # 注入工具
    ├── video-badge.py       # 视频类型标识（深度视频）
    ├── manifest.example.json    # 发布清单模板 ★先用这个
    └── docs/                # 标题规则、封面规范、坑位清单、自检清单
```

## 第一次跑通的最短路径

```bash
cd tools/publish
npm install                              # 装 ws
cp manifest.example.json manifest.json   # 填自己的路径
node preflight.js --manifest manifest.json   # 上传前预检
node test-guard.js                       # 工具链自测
node publish-all.js --manifest manifest.json --publish
```

剪辑侧（无浏览器依赖）：

```bash
ffmpeg -i 原片.mp4 -vn -ar 16000 -ac 1 audio.wav
python3 scripts/cut-silences.py audio.wav sub.srt <时长秒> filter.txt cutplan.json
python3 tools/publish/gen-kdb.py --video master-cut.mp4 --ass 字幕.ass \
  --title "白字行|金黄行|署名" --points points.json --out 成片.mp4
```

注意：兜底脚本 `scripts/douyin-finish.js` / `channels-finish.js` 需要 `ws` 依赖。若 skill 目录没有 node_modules，用
`PUB_LIB=/你的/tools/publish/lib.js node scripts/douyin-finish.js ...` 指向已装依赖的目录。

## 免责声明

- 本工具通过 CDP 驱动真实浏览器，**可能违反各平台服务条款**（自动化操作）。仅供学习交流，使用风险自负。
- 平台页面结构随时会变，选择器可能失效——这是所有自动化发布工具的固有维护成本。
- 请勿用于批量垃圾内容、刷量等违规用途。

## License

MIT
