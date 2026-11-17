#!/bin/bash
# 用法: ./stop-task-browser.sh <task-name>
TASK="${1:?用法: stop-task-browser.sh <task-name>}"
LOCK="$HOME/.chrome-cdp-tasks/$TASK.lock"
if [ -f "$LOCK" ]; then
  PID=$(cat "$LOCK")
  kill "$PID" 2>/dev/null || true
  rm -f "$LOCK"
  echo "已停止 task=$TASK pid=$PID"
else
  echo "没有锁: $LOCK"
fi
