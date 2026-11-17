#!/usr/bin/env python3
"""课代表式版式生成器：顶部标题 + 中间人讲 + 底部要点PPT。
用法: python3 gen-kdb.py --video v.mp4 --ass 字幕.ass --title "顶部标题" --points points.json --out out.mp4
points.json: [{"start":0,"end":35,"text":"要点第一行\\n要点第二行"}, ...]  （时间为成片时间轴）
"""
import argparse, json, subprocess, os
from PIL import Image, ImageDraw, ImageFont

PING = "/System/Library/AssetsV2/com_apple_MobileAsset_Font8/86ba2c91f017a3749571a82f2c6d890ac7ffb2fb.asset/AssetData/PingFang.ttc"

def font(sz, bold=True, song=False):
    # 苹方：标题 Semibold(11)，正文 Regular(3)
    return ImageFont.truetype(PING, sz, index=11 if bold else 3)

def wrap_text(draw, text, fnt, maxw):
    lines = []
    for seg in text.split("\n"):
        cur = ""
        for ch in seg:
            if draw.textlength(cur + ch, font=fnt) <= maxw or not cur:
                cur += ch
            else:
                lines.append(cur); cur = ch
        lines.append(cur)
    return lines

def make_title_png(text, path, W=1080, H=420):
    # 审美版：墨蓝黑底(#101827) + 白色主标 + 香槟金强调(#D9B36C) + 右上胶囊
    img = Image.new("RGB", (W, H), (16, 24, 39))
    d = ImageDraw.Draw(img)
    lines = text.split("|")
    f_big = font(104)
    blocks = []
    if len(lines) > 0 and lines[0]:
        blocks += [(ln, (255,255,255)) for ln in wrap_text(d, lines[0], f_big, W-160)]
    if len(lines) > 1 and lines[1]:
        blocks += [(ln, (217,179,108)) for ln in wrap_text(d, lines[1], f_big, W-160)]
    total_h = len(blocks)*118 + (34 if len(lines)>2 else 0)
    y = (H-total_h)//2
    for ln, color in blocks:
        d.text((72, y), ln, font=f_big, fill=color); y += 118
    if len(lines) > 2 and lines[2]:
        d.text((72, y+2), lines[2], font=font(36, bold=False), fill=(138,147,166))
    # 右上"深度视频"胶囊：描边香槟金、细字
    f_tag = font(30, bold=False)
    tw = d.textlength("深度视频", font=f_tag)
    x0 = W-72-tw-40
    d.rounded_rectangle((x0, 56, W-72, 56+52), radius=26, outline=(217,179,108), width=2)
    d.text((x0+20, 56+11), "深度视频", font=f_tag, fill=(217,179,108))
    img.save(path)

def make_point_png(text, path, W=1080, H=420, idx=1, total=1):
    # 品牌蓝渐变底 + 浅蓝眉题 + 白主文 + 右下页码
    top, bot = (11, 79, 224), (8, 52, 158)
    img = Image.new("RGB", (W, H))
    d0 = ImageDraw.Draw(img)
    for yy in range(H):
        r = int(top[0]+(bot[0]-top[0])*yy/H); g = int(top[1]+(bot[1]-top[1])*yy/H); b = int(top[2]+(bot[2]-top[2])*yy/H)
        d0.line([(0,yy),(W,yy)], fill=(r,g,b))
    d = ImageDraw.Draw(img)
    rows = text.split("|")
    y = 52
    if len(rows) > 0 and rows[0]:
        d.text((72, y), rows[0], font=font(34, bold=False), fill=(157,183,240)); y += 58
    if len(rows) > 1 and rows[1]:
        f2 = font(60)
        for ln in wrap_text(d, rows[1], f2, W-160):
            d.text((72, y), ln, font=f2, fill=(255,255,255)); y += 82
    if len(rows) > 2 and rows[2]:
        d.text((72, y+6), rows[2], font=font(36, bold=False), fill=(157,183,240))
    # 右下页码
    f_pg = font(30, bold=False)
    pg = f"{idx:02d} / {total:02d}"
    tw = d.textlength(pg, font=f_pg)
    d.text((W-72-tw, H-52), pg, font=f_pg, fill=(157,183,240))
    img.save(path)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--ass", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--points", required=True, help="points.json")
    ap.add_argument("--out", required=True)
    ap.add_argument("--t", default="", help="只出前 N 秒样片")
    a = ap.parse_args()

    pts = json.load(open(a.points))
    tmp = "kdb-tmp"; os.makedirs(tmp, exist_ok=True)
    make_title_png(a.title, f"{tmp}/title.png")
    for i, p in enumerate(pts):
        make_point_png(p["text"], f"{tmp}/pt{i}.png", idx=i+1, total=len(pts))

    # 构建 filter：
    # [0:v] 人物区：scale 宽 1080 高 607，pad 到 1080x1280 放在 y=280 的黑色画布上
    # overlay 顶部标题 + 底部要点（enable 按时间）
    F = []
    F.append("[0:v]crop=1080:1080:420:0,scale=1080:1080:flags=lanczos,pad=1080:1920:0:420:color=black[base]")
    F.append(f"[base][1:v]overlay=0:0[t0]")
    prev = "t0"
    img_idx = 2
    for i, p in enumerate(pts):
        nxt = f"p{i}"
        F.append(f"[{prev}][{img_idx}:v]overlay=0:1500:enable='between(t,{p['start']},{p['end']})'[{nxt}]")
        prev = nxt
        img_idx += 1
    F.append(f"[{prev}]subtitles={a.ass}:fontsdir=/System/Library/Fonts[v]")
    fc = ";".join(F)

    inputs = ["-i", a.video, "-i", f"{tmp}/title.png"]
    for i in range(len(pts)):
        inputs += ["-loop", "1", "-t", str(max(1, pts[i]["end"] - pts[i]["start"])), "-i", f"{tmp}/pt{i}.png"]
    cmd = ["ffmpeg", "-y"] + inputs
    if a.t:
        cmd += ["-t", a.t]
    cmd += ["-filter_complex", fc, "-map", "[v]", "-i" if False else "-map", "0:a?"]
    # 修正 map 顺序问题，直接重拼
    cmd = ["ffmpeg", "-y"] + inputs
    if a.t:
        cmd += ["-t", a.t]
    cmd += ["-filter_complex", fc, "-map", "[v]", "-map", "0:a?", "-c:v", "libx264",
            "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", a.out]
    print(" ".join(cmd)[:200], "...")
    subprocess.run(cmd, check=True)
    print("OK", a.out)

if __name__ == "__main__":
    main()
