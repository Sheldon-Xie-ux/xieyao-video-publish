#!/usr/bin/env python3
"""剪气口：静音检测 + 纯语气词段删除，生成 ffmpeg trim/concat filter。
用法: python3 cut-silences.py <audio.wav> <srt> <dur秒> <out_filter.txt> <out_plan.json>
依赖: ffmpeg silencedetect。ffprobe 取时长。SRT 为 whisper 输出。
"""
import re, json, subprocess, sys

audio, srt, dur_s, out_filter, out_plan = sys.argv[1:6]
DUR = float(dur_s)

# 1) 静音检测（ffmpeg 9 输出格式：silence_start 与 silence_duration 分两行）
p = subprocess.run(['ffmpeg','-hide_banner','-i',audio,'-af','silencedetect=noise=-35dB:d=0.5','-f','null','-'],
                   capture_output=True, text=True)
sils, cur = [], None
for l in p.stderr.split('\n'):
    m = re.search(r'silence_start: ([\d.]+)', l)
    if m: cur = float(m.group(1))
    m2 = re.search(r'silence_duration: ([\d.]+)', l)
    if m2 and cur is not None:
        d = float(m2.group(1)); sils.append((cur, cur+d)); cur = None

# 2) 语气词纯段
segs = []
for blk in open(srt, encoding='utf-8').read().strip().split('\n\n'):
    ls = [l for l in blk.split('\n') if l.strip()]
    if len(ls) < 2: continue
    m = re.match(r'(\d+):(\d+):(\d+)[,.](\d+) --> (\d+):(\d+):(\d+)[,.](\d+)', ls[1])
    if not m: continue
    g = list(map(int, m.groups()))
    segs.append((g[0]*3600+g[1]*60+g[2]+g[3]/1000, g[4]*3600+g[5]*60+g[6]+g[7]/1000, ' '.join(ls[2:]).strip()))

def norm(t): return re.sub(r'[,\.\??!!、，。？！\s]', '', t)
FILLCHAR = set('嗯啊呃哦对好呢吧嘛么呀哪')
filler = [(s,e) for s,e,t in segs if len(norm(t))<=5 and all(c in FILLCHAR for c in norm(t))]

# 3) 合成剪切区间：静音>0.5s 各留0.18s呼吸；纯语气词段全删
cuts = [(s+0.18, e-0.18) for s,e in sils if e-s > 0.5] + filler
cuts.sort()
merged = []
for c in cuts:
    if merged and c[0] < merged[-1][1]-0.05:
        merged[-1] = (merged[-1][0], max(merged[-1][1], c[1]))
    else:
        merged.append(list(c))
cut_total = sum(e-s for s,e in merged)

# 4) 保留区间 + filter
kept, prev = [], 0.0
for s,e in merged:
    if s > prev: kept.append((round(prev,3), round(s,3)))
    prev = max(prev,e)
if prev < DUR: kept.append((round(prev,3), DUR))

L = []
for i,(s,e) in enumerate(kept):
    L.append(f'[0:v]trim=start={s}:end={e},setpts=PTS-STARTPTS[v{i}]')
    L.append(f'[0:a]atrim=start={s}:end={e},asetpts=PTS-STARTPTS[a{i}]')
vs = ''.join(f'[v{i}][a{i}]' for i in range(len(kept)))
L.append(f'{vs}concat=n={len(kept)}:v=1:a=1[v][a]')
open(out_filter,'w').write(';'.join(L))
json.dump({'kept':kept,'cuts':merged,'dur':DUR,'segs':segs}, open(out_plan,'w'), ensure_ascii=False)
print(f'静音{len(sils)} 语气词{len(filler)} 剪切{len(merged)} 剪掉{cut_total:.1f}s → 成片约{(DUR-cut_total)/60:.1f}分钟')
