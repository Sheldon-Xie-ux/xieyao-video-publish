#!/bin/bash
# 发布用压缩模板：口播类竖版视频，目标是"画质够看、文件最小、上传最快"
# 用法: ./compress-for-upload.sh <输入.mp4> <输出.mp4>
# 参数依据 2026-11-12 上传实测：抖音单流约 0.3MB/s，79MB 要 4.5 分钟；压到 ~55MB 省 1/3。
set -e
IN="${1:?输入视频}"
OUT="${2:?输出路径}"
ffmpeg -y -i "$IN" \
  -c:v libx264 -preset slow -b:v 2000k -maxrate 2400k -bufsize 4000k \
  -pix_fmt yuv420p -profile:v high -level 4.0 \
  -x264-params keyint=120:min-keyint=60 \
  -c:a aac -b:a 96k -ar 44100 -ac 1 \
  -movflags +faststart \
  "$OUT"
echo "OK $(du -h "$OUT" | cut -f1) $OUT"
