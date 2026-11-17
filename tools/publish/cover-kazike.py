#!/usr/bin/env python3
"""卡兹克（数字生命卡兹克）版式封面。

版式：上方真实画面铺满（无圆角）+ 下方纯白留白 + 宋体黑色大标题 + 作者行。
视频类左上角加「深度视频」黑底胶囊 + 黄色播放三角；笔记类不加任何标识。

用法:
  python3 cover-kazike.py --image 帧.jpg --title "标题正文" --ratio 3:4 --out 封面.jpg
  python3 cover-kazike.py --image 帧.jpg --title "标题" --badge 深度视频 --crop-y 0.35 --out x.jpg

可选:
  --badge     深度视频 / 深度解读 / 深度拆解，传 none 或不传则不加
  --author    封面署名（必填）
  --crop-y    上图纵向裁切焦点 0=顶 1=底（默认 0.5）
  --crop-x    横向裁切焦点（默认 0.5）
  --img-ratio 上图占整高比例（默认 0.52）
  --size      主标题字号（默认 86，按 1080 宽）
  --title-lines 手动换行，用 | 分隔
"""
import argparse
from PIL import Image, ImageDraw, ImageFont

SONGTI = "/System/Library/Fonts/Supplemental/Songti.ttc"
WHITE = (255, 255, 255)
INK = (17, 17, 17)
GRAY = (68, 68, 68)

SIZES = {"3:4": (1080, 1440), "9:16": (1080, 1920), "16:9": (1920, 1080), "4:3": (1440, 1080)}


def font(size, bold=True):
    return ImageFont.truetype(SONGTI, size, index=1 if bold else 6)


def cover_crop(im, w, h, ax=0.5, ay=0.5):
    r = max(w / im.width, h / im.height)
    nw, nh = max(w, round(im.width * r)), max(h, round(im.height * r))
    im = im.resize((nw, nh), Image.LANCZOS)
    x, y = (nw - w) * ax, (nh - h) * ay
    return im.crop((round(x), round(y), round(x) + w, round(y) + h))


def wrap(draw, text, fnt, maxw):
    """空格优先断行，块内再按字折行，英文/数字不拆开。"""
    def char_wrap(seg):
        out, cur, buf = [], "", ""
        toks = []
        for ch in seg:
            if ch.isascii() and not ch.isspace():
                buf += ch
                continue
            if buf:
                toks.append(buf)
                buf = ""
            toks.append(ch)
        if buf:
            toks.append(buf)
        for t in toks:
            trial = cur + t
            if draw.textlength(trial, font=fnt) <= maxw or not cur:
                cur = trial
            else:
                out.append(cur.rstrip())
                cur = t.lstrip()
        if cur:
            out.append(cur.rstrip())
        return out or [""]

    lines, cur = [], ""
    for chunk in text.split(" "):
        if not chunk:
            continue
        for piece in char_wrap(chunk):
            cand = (cur + " " + piece) if cur else piece
            if draw.textlength(cand, font=fnt) <= maxw or not cur:
                cur = cand
            else:
                lines.append(cur)
                cur = piece
    if cur:
        lines.append(cur)
    return lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--ratio", default="3:4", choices=list(SIZES))
    ap.add_argument("--out", required=True)
    ap.add_argument("--badge", default="none")
    ap.add_argument("--author", default="", help="封面上显示的作者名")
    ap.add_argument("--crop-y", type=float, default=0.5)
    ap.add_argument("--crop-x", type=float, default=0.5)
    ap.add_argument("--img-ratio", type=float, default=0.52)
    ap.add_argument("--size", type=int, default=0)
    ap.add_argument("--title-lines", default="")
    ap.add_argument("--fit", default="cover", choices=["cover", "blur"])
    ap.add_argument("--fg-crop-bottom", type=float, default=0.0)
    ap.add_argument("--trim-top", type=int, default=0, help="先裁掉源图顶部像素（去掉原生标题栏）")
    a = ap.parse_args()

    W, H = SIZES[a.ratio]
    # 手动指定字号时，其余排版按 1080 基准（避免 16:9 下字号被比例放大导致溢出）
    scale = 1.0 if a.size else W / 1080
    img_h = round(H * a.img_ratio)
    title_size = a.size or round(96 * scale)
    line_gap = 1.28
    pad = round(76 * scale)          # 标题左/上边距（相对 1080 宽）

    canvas = Image.new("RGB", (W, H), WHITE)
    photo = Image.open(a.image).convert("RGB")
    if a.trim_top:
        photo = photo.crop((0, a.trim_top, photo.width, photo.height))
    if a.fit == "blur":
        from PIL import ImageFilter, ImageEnhance
        bg = cover_crop(photo, W, img_h, 0.5, 0.5).filter(ImageFilter.GaussianBlur(42))
        bg = ImageEnhance.Color(bg).enhance(0.35)
        bg = Image.eval(bg, lambda v: int(v * 0.90))
        canvas.paste(bg, (0, 0))
        fh = round(img_h * 0.97)
        src = photo
        if a.fg_crop_bottom > 0:
            src = photo.crop((0, 0, photo.width, round(photo.height * (1 - a.fg_crop_bottom))))
        fw = round(src.width * fh / src.height)
        fg = src.resize((fw, fh), Image.LANCZOS)
        canvas.paste(fg, ((W - fw) // 2, img_h - fh))
    else:
        canvas.paste(cover_crop(photo, W, img_h, a.crop_x, a.crop_y), (0, 0))

    draw = ImageDraw.Draw(canvas)
    f_title = font(title_size)
    f_author = font(round(44 * scale), bold=False)

    text = (a.title_lines or a.title).replace("|", "\n")
    lines = []
    for seg in text.split("\n"):
        seg_lines = wrap(draw, seg, f_title, W - pad * 2)
        if len(seg_lines) > 1 and len(seg_lines[-1].strip()) <= 2:
            narrow = W - pad * 2
            for k in range(10):
                narrow = int(narrow * 0.93)
                trial = wrap(draw, seg, f_title, narrow)
                if len(trial) == len(seg_lines) and len(trial[-1].strip()) > 2:
                    seg_lines = trial
                    break
        lines += seg_lines

    y = img_h + round(88 * scale)
    lh = round(title_size * line_gap)
    for ln in lines:
        draw.text((pad, y), ln, font=f_title, fill=INK)
        y += lh

    y += round(26 * scale)
    draw.text((pad, y), f"| 作者：{a.author}", font=f_author, fill=GRAY)

    if a.badge and a.badge != "none":
        fs = round(64 * scale)
        f = ImageFont.truetype("/System/Library/Fonts/Hiragino Sans GB.ttc", fs, index=1)
        bbox = draw.textbbox((0, 0), a.badge, font=f)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        tri = fs * 0.62
        gap = fs * 0.40
        padx, pady = fs * 0.42, fs * 0.28
        bw = int(padx * 2 + tri + gap + tw)
        bh = int(pady * 2 + max(th, fs * 0.82))
        x0, y0 = round(56 * scale), round(44 * scale)
        draw.rounded_rectangle((x0, y0, x0 + bw, y0 + bh), radius=int(bh * 0.30), fill=(18, 16, 14))
        cx, cy = x0 + padx, y0 + bh / 2
        draw.polygon([(cx, cy - tri / 2), (cx, cy + tri / 2), (cx + tri * 0.85, cy)], fill=(255, 214, 64))
        draw.text((cx + tri + gap, y0 + (bh - th) / 2 - bbox[1]), a.badge, font=f, fill=WHITE)

    canvas.save(a.out, quality=95)
    print(a.out)


if __name__ == "__main__":
    main()
