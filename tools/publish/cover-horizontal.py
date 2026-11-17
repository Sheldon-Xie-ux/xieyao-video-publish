#!/usr/bin/env python3
"""横版视频封面：原视频帧铺满 + 大字白字黑描边 + 黄色标签。
用法:
  python3 cover-horizontal.py --frame f.jpg --title "第一行|第二行" --accent "FDE创业" --out16 a.jpg --out43 b.jpg
"""
import argparse
from PIL import Image, ImageDraw, ImageFont, ImageFilter

F="/System/Library/Fonts/Hiragino Sans GB.ttc"
def font(sz,b=True): return ImageFont.truetype(F,sz,index=1 if b else 0)

def badge(d, W, H, fs, text):
    x=int(W*0.055); y=int(H*0.05); tri=fs*0.62; gap=fs*0.42
    b=d.textbbox((0,0),text,font=font(fs)); tw=b[2]-b[0]; th=b[3]-b[1]
    padx=int(fs*0.42); pady=int(fs*0.30)
    w=int(padx*2+tri+gap+tw); h=int(pady*2+max(th,fs))
    d.rounded_rectangle((x,y,x+w,y+h),radius=int(h*0.28),fill=(20,18,16))
    cx=x+padx; cy=y+h/2
    d.polygon([(cx,cy-tri/2),(cx,cy+tri/2),(cx+tri*0.85,cy)],fill=(255,214,64))
    d.text((cx+tri+gap, y+(h-th)/2-b[1]), text, font=font(fs), fill=(255,255,255))

def cover(frame, lines, accent, W, H, out, main_sz, accent_sz, badge_text='深度视频'):
    im=Image.open(frame).convert("RGB")
    # 原帧铺满（等比裁切，不拉伸）
    r=max(W/im.width, H/im.height)
    im=im.resize((int(im.width*r+0.5),int(im.height*r+0.5)),Image.LANCZOS)
    L=(im.width-W)//2; T=(im.height-H)//2
    im=im.crop((L,T,L+W,T+H)).convert("RGBA")
    # 底部压暗，保证白字可读
    grad=Image.new("L",(1,H),0); px=grad.load()
    for y in range(H):
        t=max(0,(y-H*0.35)/(H*0.65))
        px[0,y]=int(200*min(1,t))
    grad=grad.resize((W,H))
    dark=Image.new("RGBA",(W,H),(0,0,0,0)); dark.putalpha(grad)
    im=Image.alpha_composite(im,dark)
    d=ImageDraw.Draw(im)
    badge(d,W,H,96 if W>1440 else 80,badge_text)
    x=int(W*0.045); y=int(H*0.48)
    d.text((x,y),accent,font=font(accent_sz),fill=(255,214,64),stroke_width=4,stroke_fill=(0,0,0))
    y+=int(accent_sz*1.18)
    for line in lines:
        d.text((x,y),line,font=font(main_sz),fill=(255,255,255),stroke_width=max(6,main_sz//14),stroke_fill=(0,0,0))
        y+=int(main_sz*1.12)
    im.convert("RGB").save(out,quality=95)
    print(out)

ap=argparse.ArgumentParser()
ap.add_argument('--frame',required=True)
ap.add_argument('--title',required=True,help='用 | 分两行')
ap.add_argument('--accent',default='')
ap.add_argument('--out16',required=True)
ap.add_argument('--out43',required=True)
ap.add_argument('--badge',default='深度视频')
a=ap.parse_args()
lines=[s.strip() for s in a.title.split('|') if s.strip()]
cover(a.frame,lines,a.accent,1920,1080,a.out16,180,100,a.badge)
cover(a.frame,lines,a.accent,1440,1080,a.out43,140,80,a.badge)
