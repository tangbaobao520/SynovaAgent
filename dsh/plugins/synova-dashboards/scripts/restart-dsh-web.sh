#!/usr/bin/env bash
# restart-dsh-web.sh — 重启 dsh web（供 CTO 会话外执行：kill 旧进程 → 启动新进程 → 验证）
# 用法: bash dsh/plugins/synova-dashboards/scripts/restart-dsh-web.sh
# 说明: 以 setsid/nohup 脱离当前会话执行，kill 旧进程不会中断本脚本；
#       日志写 /tmp/dsh-web-restart.log。数据路由在 CTO 会话打开前会 404（预期）。
set -uo pipefail

LOG=/tmp/dsh-web-restart.log
PORT=3080
REPO=/Users/wane/SynovaAgent

echo "=== $(date '+%F %T') restart start ===" > "$LOG"

# 1) 找到并优雅停掉旧进程
OLDPID=$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null | head -1)
echo "old pid: ${OLDPID:-none}" >> "$LOG"
if [ -n "${OLDPID:-}" ]; then
  kill -TERM "$OLDPID" 2>>"$LOG" || true
  for _ in $(seq 1 20); do
    kill -0 "$OLDPID" 2>/dev/null || break
    sleep 0.5
  done
  kill -0 "$OLDPID" 2>/dev/null && kill -KILL "$OLDPID" 2>>"$LOG" || true
  echo "old process stopped" >> "$LOG"
fi
sleep 1

# 2) 启动新进程（detached）
cd "$REPO" || exit 1
nohup dsh web >> "$LOG" 2>&1 &
NEWPID=$!
echo "new pid: $NEWPID (dsh web)" >> "$LOG"

# 3) 等端口起来
UP=0
for _ in $(seq 1 60); do
  if curl -s -o /dev/null "http://127.0.0.1:${PORT}/" 2>/dev/null; then
    UP=1
    echo "port ${PORT} up" >> "$LOG"
    break
  fi
  sleep 0.5
done
[ "$UP" = 0 ] && echo "!! port ${PORT} NOT up after 30s — 请手动运行: dsh web" >> "$LOG"

# 4) 验证 GUI + 数据路由（数据路由在 CTO 会话挂载后才注册，此前 404 属预期）
sleep 2
echo "--- index.html ---" >> "$LOG"
curl -s -o /dev/null -w "HTTP %{http_code}\n" "http://127.0.0.1:${PORT}/" >> "$LOG" 2>&1
echo "--- /synova/dashboards/data (CTO 会话打开前 404 属预期) ---" >> "$LOG"
curl -s -w "\nHTTP %{http_code}\n" "http://127.0.0.1:${PORT}/synova/dashboards/data" >> "$LOG" 2>&1 || true

echo "=== $(date '+%F %T') restart done ===" >> "$LOG"
