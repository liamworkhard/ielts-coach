#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
PORT="${PORT:-8123}"

if lsof -i ":$PORT" >/dev/null 2>&1; then
  echo "端口 $PORT 已被占用，正在打开已有服务：http://localhost:$PORT"
  open "http://localhost:$PORT"
  exit 0
fi

python3 -m http.server "$PORT" >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT

sleep 0.8
open "http://localhost:$PORT"
echo "词光 · 雅思词汇诊断已启动：http://localhost:$PORT"
echo "按 Ctrl+C 停止。"
wait "$SERVER_PID"
