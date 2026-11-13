#!/usr/bin/env python3
"""课代表版式字幕：72px 苹方、顶部对齐(Alignment=8) MarginV=1300（人物区下沿，不进要点条）、11字断行。
用法: python3 gen-subtitles-kdb.py <srt> <out.ass> [--shift cutplan.json]
cutplan.json 存在时自动把字幕时间轴平移到剪切后时间轴。
"""
import re, sys, json

srt_path, out_path = sys.argv[1], sys.argv[2]
shift = None
if '--shift' in sys.argv:
    plan = json.load(open(sys.argv[sys.argv.index('--shift')+1]))
    cuts = plan['cuts']
    def shift_fn(t): return t - sum(e-s for s,e in cuts if e <= t+0.001)
else:
    shift_fn = lambda t: t

MAX = 11
PUNCT = '，。？！、；：'
WEAK = '的了是就那它这也但因所而呢啊吧嘛在把被和与或'

def split_spans(t):
    parts, cur = [], ''
    for ch in t:
        cur += ch
        if ch in PUNCT: parts.append(cur); cur = ''
    if cur: parts.append(cur)
    return parts

def wrap(t):
    out = []
    for part in split_spans(t):
        if len(part) <= MAX: out.append(part); continue
        s = part
        while len(s) > MAX:
            cut = None
            for i in range(MAX, max(5, MAX-6), -1):
                if i < len(s) and s[i-1] in WEAK: cut = i; break
            if not cut: cut = MAX-1
            out.append(s[:cut]); s = s[cut:]
        if s: out.append(s)
    return out

def ts(t):
    h = int(t//3600); m = int(t%3600//60); s = t%60
    return f"{h}:{m:02d}:{s:05.2f}"

head = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Hiragino Sans GB,72,&H00FFFFFF,&H00FFFFFF,&H00000000,&HA0000000,1,0,0,0,100,100,0,0,1,6,2,8,56,56,1300,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
out = [head]
n = 0
for blk in open(srt_path, encoding='utf-8').read().strip().split('\n\n'):
    ls = [l for l in blk.split('\n') if l.strip()]
    if len(ls) < 2: continue
    m = re.match(r'(\d+):(\d+):(\d+)[,.](\d+) --> (\d+):(\d+):(\d+)[,.](\d+)', ls[1])
    if not m: continue
    g = list(map(int, m.groups()))
    st = shift_fn(g[0]*3600+g[1]*60+g[2]+g[3]/1000)
    et = shift_fn(g[4]*3600+g[5]*60+g[6]+g[7]/1000)
    txt = ' '.join(ls[2:]).strip()
    if not txt: continue
    body = '\\N'.join(wrap(txt))
    out.append('Dialogue: 0,%s,%s,Sub,,0,0,0,,%s' % (ts(max(st,0)), ts(max(et,st+0.4)), body))
    n += 1
open(out_path, 'w', encoding='utf-8').write('\n'.join(out))
print(f'{out_path} {n} 条')
