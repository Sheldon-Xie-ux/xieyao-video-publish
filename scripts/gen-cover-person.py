#!/usr/bin/env python3
"""人物版封面（默认封面模板，2026-11-12 用户定稿）：上方居中标题 + 中间人物实拍帧 + 金色分割线。
用法: python3 gen-cover-person.py --frame 人物帧.jpg --title "白字行|金黄行|灰色副题" --out 封面.jpg --ratio 3:4|9:16|16:9|4:3
人物帧: 从成片 crop 的方形近景（ffmpeg crop=1080:1080:420:0 后截帧）。
"""
import argparse
from PIL import Image, ImageDraw, ImageFont

PING = "/System/Library/AssetsV2/com_apple_MobileAsset_Font8/86ba2c91f017a3749571a82f2c6d890ac7ffb2fb.asset/AssetData/PingFang.ttc"
BG = (16, 24, 39)
GOLD = (242, 194, 0)
GRAY = (201, 201, 201)
LIGHT = (200, 206, 216)

def f(sz, i=11):
    return ImageFont.truetype(PING, sz, index=i)

ap = argparse.ArgumentParser()
ap.add_argument('--frame', required=True)
ap.add_argument('--title', required=True, help='白字|金黄|副题')
ap.add_argument('--out', required=True)
ap.add_argument('--ratio', default='3:4')
ap.add_argument('--by', default='', help='底部署名，如 你的名字-账号名')
a = ap.parse_args()

person = Image.open(a.frame).convert('RGB')
lines = a.title.split('|')
t1 = lines[0] if len(lines) > 0 else ''
t2 = lines[1] if len(lines) > 1 else ''
sub = lines[2] if len(lines) > 2 else ''

def draw_text_block(d, W, ty1, ty2, tsy, f1s, f2s, fs3):
    if t1:
        w = d.textlength(t1, font=f(f1s)); d.text(((W-w)/2, ty1), t1, font=f(f1s), fill=(255,255,255))
    if t2:
        w = d.textlength(t2, font=f(f2s)); d.text(((W-w)/2, ty2), t2, font=f(f2s), fill=GOLD)
    if sub:
        w = d.textlength(sub, font=f(fs3, 3)); d.text(((W-w)/2, tsy), sub, font=f(fs3, 3), fill=GRAY)

if a.ratio == '3:4':
    W, H = 1080, 1440
    img = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(img)
    draw_text_block(d, W, 64, 180, 302, 92, 92, 40)
    d.rectangle([0, 400, W, 406], fill=GOLD)
    img.paste(person, (0, 420))
    d.text((72, H-54), a.by, font=f(32, 3), fill=LIGHT)
elif a.ratio == '9:16':
    W, H = 1080, 1920
    img = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(img)
    draw_text_block(d, W, 120, 250, 392, 100, 100, 44)
    d.rectangle([0, 500, W, 506], fill=GOLD)
    img.paste(person, (0, 520))
    d.text((72, H-64), a.by, font=f(34, 3), fill=LIGHT)
elif a.ratio == '16:9':
    W, H = 1920, 1080
    img = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(img)
    img.paste(person.resize((1080, 1080), Image.LANCZOS), (0, 0))
    d.rectangle([1080, 0, 1086, H], fill=GOLD)
    tx = 1140; avail = W - tx - 60
    def fit(t, sz, mn=56):
        while sz > mn and d.textlength(t, font=f(sz)) > avail: sz -= 2
        return f(sz)
    if t1: d.text((tx, 250), t1, font=fit(t1, 110), fill=(255,255,255))
    if t2: d.text((tx, 390), t2, font=fit(t2, 110), fill=GOLD)
    if sub: d.text((tx, 540), sub, font=fit(sub, 46, 30), fill=GRAY)
    d.text((tx, H-80), a.by, font=f(36, 3), fill=(138,147,166))
else:  # 4:3
    W, H = 1440, 1080
    img = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(img)
    img.paste(person.resize((810, 810), Image.LANCZOS), (0, 135))
    d.rectangle([810, 0, 815, H], fill=GOLD)
    tx = 860; avail = W - tx - 40
    def fit4(t, sz, mn=44):
        while sz > mn and d.textlength(t, font=f(sz)) > avail: sz -= 2
        return f(sz)
    if t1: d.text((tx, 230), t1, font=fit4(t1, 92), fill=(255,255,255))
    if t2: d.text((tx, 350), t2, font=fit4(t2, 92), fill=GOLD)
    if sub: d.text((tx, 480), sub, font=fit4(sub, 40, 26), fill=GRAY)
    d.text((tx, H-70), a.by, font=f(32, 3), fill=(138,147,166))
img.save(a.out, quality=93)
print(a.out)
