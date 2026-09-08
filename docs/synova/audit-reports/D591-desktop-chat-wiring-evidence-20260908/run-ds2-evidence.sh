#!/bin/bash
# D591 DS2/DS3/DS4 物理证据采集 — 生产态（DEV_MODE=false、无 Authorization）
# 桌面消费核心 = 生产模块 createStreamingController/restoreLastSession（非测试替身），挂真实后端全链路。
# LLM = 本地替身服务器（本机无真实 key，D590 先例；换真实 endpoint 改两行 env 即完全生产语义）。
# K3 复现: bash run-ds2-evidence.sh（幂等自清理）
set -uo pipefail
cd "$(dirname "$0")/../../../.."   # → 仓库根

EV=docs/synova/audit-reports/D591-desktop-chat-wiring-evidence-20260908
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"

PORT=18902
LLMPORT=9202
WORK=$(mktemp -d /tmp/d591-e2e.XXXXXX)
LOG="$EV/e2e-ds2-desktop-chat.log.txt"

# 端口预清理（幂等重跑）
lsof -ti :$PORT | xargs kill 2>/dev/null   # swallow-ok: 探测型端口预清理（无监听即空操作）
lsof -ti :$LLMPORT | xargs kill 2>/dev/null  # swallow-ok: 同上
sleep 1

echo "== 0. 环境声明 ==" > "$LOG"
{
echo "date: $(date)"
echo "DEV_MODE=false / JWT_SECRET=<unset> / 全程无 Authorization 头"
echo "LLM = 本地替身 http://127.0.0.1:${LLMPORT}（本机无真实 key；生产代码全链路真实——"
echo "     桌面消费核心 createStreamingController/restoreLastSession + 真实 fetch → HTTP → 路由 → 引擎 → SSE → 落库）"
echo "驱动器: ds2-driver.ts（生产模块 import，fetch 仅日志透传）"
} >> "$LOG"

# ── LLM 替身（OpenAI 兼容；端口经 argv 传入）──
node -e 'const http=require("http");http.createServer((req,res)=>{let b="";req.on("data",c=>b+=c);req.on("end",()=>{res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({choices:[{message:{role:"assistant",content:"你好！我是 Synova。请告诉我贵团队的规模，以及当前最影响增长的一个瓶颈是什么？"}}]}))})}).listen(Number(process.argv[1]),()=>console.log("LLM stand-in on",process.argv[1]))' "$LLMPORT" > "$WORK/llm.log" 2>&1 &
LLM_PID=$!
sleep 1

SYNOVA_DB_PATH="$WORK/d591.db" SYNOVA_DATA_DIR="$WORK" \
DEV_MODE=false LLM_API_KEY=local-standin-key \
LLM_BASE_URL="http://127.0.0.1:$LLMPORT" LLM_MODEL=standin-model \
SYNOVA_SKIP_MCP=1 PORT=$PORT \
npx tsx src/index.ts > "$WORK/server.log" 2>&1 &
SRV_PID=$!
for i in $(seq 1 90); do curl -s -m 2 -o /dev/null "http://localhost:$PORT/health" && break; sleep 1; done
if ! curl -s -m 2 -o /dev/null "http://localhost:$PORT/health"; then
  echo "SERVER 启动失败" >> "$LOG"; tail -20 "$WORK/server.log" >> "$LOG"; exit 1
fi
echo "server ready (pid=$SRV_PID, port=$PORT)" >> "$LOG"

# ── 驱动器（生产 controller + 恢复时序全链路）──
D591_PORT=$PORT npx tsx "$EV/ds2-driver.ts" >> "$LOG" 2>&1
DRIVER_EXIT=$?
echo "driver exit=$DRIVER_EXIT" >> "$LOG"

# ── 服务端视角: 会话已真实落库（SessionStore 读回）──
SID=$(grep -oE '"sessionId":"sess_[a-z0-9_]+"' "$LOG" | head -1 | cut -d'"' -f4)
{
echo ""
echo "== 5. 服务端视角: GET /api/sessions/${SID} （SessionStore 已落库，无凭证）=="
curl -s -m 30 "http://localhost:$PORT/api/sessions/$SID" > "$WORK/sess.json"
python3 -c "
import json
d=json.load(open('$WORK/sess.json'))
print('ok:', d.get('ok'), '| sessionId:', d['session']['id'])
for m in d['messages']:
    print(' ', m['role'], '→', m['content'][:60].replace(chr(10),' '))
" >> "$LOG" 2>&1
} 

kill $SRV_PID $LLM_PID 2>/dev/null   # swallow-ok: 采集完成收尾
wait $SRV_PID $LLM_PID 2>/dev/null   # swallow-ok: 同上
lsof -ti :$PORT | xargs kill 2>/dev/null  # swallow-ok: 收尾清理
rm -rf "$WORK"
echo "DONE (driver exit=$DRIVER_EXIT)" >> "$LOG"
exit $DRIVER_EXIT
