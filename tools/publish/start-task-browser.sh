#!/bin/bash
# 任务级隔离浏览器：独立 profile + 端口 + 锁，避免和其他任务串台
# 用法: ./start-task-browser.sh <task-name> [port]
set -e
TASK="${1:?用法: start-task-browser.sh <task-name> [port]}"
PORT="${2:-9333}"
BASE="$HOME/.chrome-cdp-profile"
ROOT="$HOME/.chrome-cdp-tasks"
DATA="$ROOT/$TASK"
LOCK="$ROOT/$TASK.lock"
APP="$HOME/agent-browser/Chrome-Agent.app"
# 没有 Chrome-Agent 就用系统 Chrome / Edge（改这里或设 CHROME_BIN 环境变量）
BIN="${CHROME_BIN:-$APP/Contents/MacOS/Google Chrome}"
[ -x "$BIN" ] || BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$BIN" ] || BIN="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
mkdir -p "$ROOT"

if curl -s --max-time 2 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  echo "已在运行: task=$TASK port=$PORT"; exit 0
fi
if [ -f "$LOCK" ]; then
  OLD=$(cat "$LOCK" 2>/dev/null || true)
  if [ -n "$OLD" ] && kill -0 "$OLD" 2>/dev/null; then
    echo "任务锁被占用: $LOCK (pid $OLD)" >&2; exit 1
  fi
  rm -f "$LOCK"
fi
if [ ! -x "$BIN" ]; then echo "缺少 $BIN" >&2; exit 1; fi
if [ ! -d "$DATA" ]; then
  echo "首次创建任务 profile: $DATA"
  mkdir -p "$DATA"
  rsync -a --exclude 'Cache*' --exclude 'Code Cache' --exclude 'GPUCache' \
    --exclude 'Service Worker/CacheStorage' --exclude 'Singleton*' "$BASE/" "$DATA/"
fi
rm -f "$DATA/SingletonLock" "$DATA/SingletonSocket" "$DATA/SingletonCookie"
nohup "$BIN" --user-data-dir="$DATA" --profile-directory="Profile 2" \
  --remote-debugging-port="$PORT" --no-first-run --no-default-browser-check --mute-audio \
  --disable-features=Translate >"$ROOT/$TASK.log" 2>&1 &
PID=$!
echo "$PID" > "$LOCK"
for i in $(seq 1 20); do
  sleep 1
  if curl -s --max-time 2 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
    echo "已启动: task=$TASK port=$PORT pid=$PID profile=$DATA"; exit 0
  fi
done
echo "启动超时，日志: $ROOT/$TASK.log" >&2; exit 1
