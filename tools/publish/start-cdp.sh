#!/bin/bash
# 启动「自动化专用」浏览器（Chrome-Agent.app），不占用用户日常 Chrome
AGENT_APP="$HOME/agent-browser/Chrome-Agent.app"
DATA_DIR="$HOME/.chrome-cdp-profile"
PORT=9222

if curl -s --max-time 2 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  echo "已在运行: port $PORT"
  exit 0
fi

if [ ! -d "$AGENT_APP" ]; then
  echo "缺少 $AGENT_APP，请先创建（见 README 第 4 节）" >&2
  exit 1
fi

open -a "$AGENT_APP" --args \
  --user-data-dir="$DATA_DIR" \
  --profile-directory="Profile 2" \
  --remote-debugging-port=$PORT \
  --no-first-run --no-default-browser-check --mute-audio

for i in $(seq 1 20); do
  sleep 1
  if curl -s --max-time 2 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
    echo "已启动: port $PORT — Chrome-Agent（独立于日常 Chrome）"
    exit 0
  fi
done
echo "启动超时" >&2
exit 1
