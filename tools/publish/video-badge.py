#!/usr/bin/env python3
"""给视频封面加“深度视频/深度解读/深度拆解”类型标识。
用法: python3 video-badge.py --image a.jpg --ratio 3:4 [--badge 深度视频] --out b.jpg
"""
import argparse
from PIL import Image, ImageDraw, ImageFont
F="/System/Library/Fonts/Hiragino Sans GB.ttc"
def font(sz): return ImageFont.truetype(F,sz,index=1)
ap=argparse.ArgumentParser()
ap.add_argument('--image',required=True)
ap.add_argument('--ratio',required=True,choices=['3:4','9:16','16:9','4:3'])
ap.add_argument('--badge',default='深度视频')
ap.add_argument('--out',required=True)
a=ap.parse_args()
im=Image.open(a.image).convert('RGBA'); W,H=im.size
fs={'3:4':64,'9:16':64,'16:9':96,'4:3':80}[a.ratio]
f=font(fs)
x=int(W*0.055); y=int(H*0.05)
tri=fs*0.62; gap=fs*0.42
bbox=ImageDraw.Draw(im).textbbox((0,0),a.badge,font=f)
tw=bbox[2]-bbox[0]; th=bbox[3]-bbox[1]
padx=int(fs*0.42); pady=int(fs*0.30)
w=int(padx*2+tri+gap+tw); h=int(pady*2+max(th,fs))
# 黑底胶囊
d=ImageDraw.Draw(im)
d.rounded_rectangle((x,y,x+w,y+h),radius=int(h*0.28),fill=(20,18,16,235))
# 播放三角
cx=x+padx; cy=y+h/2
d.polygon([(cx,cy-tri/2),(cx,cy+tri/2),(cx+tri*0.85,cy)],fill=(255,214,64,255))
d.text((cx+tri+gap, y+(h-th)/2-bbox[1]), a.badge, font=f, fill=(255,255,255,255))
im.convert('RGB').save(a.out,quality=95)
print(a.out)
