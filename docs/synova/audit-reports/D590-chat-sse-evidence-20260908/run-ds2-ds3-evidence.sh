#!/bin/bash
# D590 DS2/DS3 物理证据采集 — 生产态（DEV_MODE=false、无 Authorization）
# LLM = 本地替身服务器（本机无真实 key；生产代码全链路真实：HTTP→路由→引擎→provider→SSE→落库）
# K3 复现: bash run-ds2-ds3-evidence.sh > 任意输出文件（脚本自身幂等，自动清理）
#   真实 key 场景: 注销 LLM stand-in 段，LLM_BASE_URL/LLM_API_KEY 改为真实值即可。
set -uo pipefail
cd "$(dirname "$0")/../../../.."   # → worktree root（evidence 目录向下 4 层）

EV=docs/synova/audit-reports/D590-chat-sse-evidence-20260908
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"

PORT=18901
LLMPORT=9201
WORK=$(mktemp -d /tmp/d590-e2e.XXXXXX)
LOG="$EV/e2e-ds2-ds3-curl.log.txt"
mkdir -p "$WORK"

# 端口预清理（幂等重跑）
lsof -ti :$PORT | xargs kill 2>/dev/null   # swallow-ok: 探测型端口预清理（无监听即空操作）
lsof -ti :$LLMPORT | xargs kill 2>/dev/null  # swallow-ok: 同上
sleep 1

say() { echo "$@" | tee -a "$LOG"; }

echo "== 0. 环境声明 ==" > "$LOG"
say "date: $(date)"
say "DEV_MODE=false / JWT_SECRET=<unset> / 全程无 Authorization 头"
say "LLM = 本地替身 http://127.0.0.1:${LLMPORT}（本机无真实 key；生产代码全链路真实——"
say "     HTTP→路由→引擎→provider HTTP 调用→SSE→落库；K3 用真实 endpoint 改两行 env 即可复现）"

# ── LLM 替身（OpenAI 兼容 /chat/completions；端口经 argv 传入，避免引号展开坑）──
node -e 'const http=require("http");http.createServer((req,res)=>{let b="";req.on("data",c=>b+=c);req.on("end",()=>{res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({choices:[{message:{role:"assistant",content:"你好！我是 Synova。请告诉我贵团队的规模，以及当前最影响增长的一个瓶颈是什么？"}}]}))})}).listen(Number(process.argv[1]),()=>console.log("LLM stand-in on",process.argv[1]))' "$LLMPORT" > "$WORK/llm.log" 2>&1 &
LLM_PID=$!
sleep 1

SRV_START() {
  SYNOVA_DB_PATH="$WORK/d590.db" SYNOVA_DATA_DIR="$WORK" \
DEV_MODE=false LLM_API_KEY=local-standin-key \
LLM_BASE_URL="http://127.0.0.1:$LLMPORT" LLM_MODEL=standin-model \
  SYNOVA_SKIP_MCP=1 PORT=$PORT \
  npx tsx src/index.ts > "$1" 2>&1 &
  SRV_PID=$!
  for i in $(seq 1 90); do curl -s -m 2 -o /dev/null "http://localhost:$PORT/health" && return 0; sleep 1; done
  return 1
}

SRV_START "$WORK/server1.log" || { say "SERVER-1 启动失败"; tail -20 "$WORK/server1.log" >> "$LOG"; exit 1; }

say ""
say "== 1. DS2: 生产态无凭证 curl 对话端点（SSE 流）=="
say "\$ curl -sN http://localhost:$PORT/api/conversations -d '{\"message\":\"你好，请介绍一下你自己\"}'   # 无 Authorization 头"
curl -sN -m 90 "http://localhost:$PORT/api/conversations" \
  -H 'Content-Type: application/json' \
  -d '{"message":"你好，请介绍一下你自己"}' > "$WORK/sse1.txt" 2>&1
head -c 1000 "$WORK/sse1.txt" >> "$LOG"
say "……（完整流已存 e2e-sse-full-stream.log.txt；帧统计：）"
say "open帧=$(grep -c 'event: open' $WORK/sse1.txt) token帧=$(grep -c 'event: token' $WORK/sse1.txt) agent_message帧=$(grep -c 'event: agent_message' $WORK/sse1.txt) end帧=$(grep -c 'event: end' $WORK/sse1.txt)"
cp "$WORK/sse1.txt" "$EV/e2e-sse-full-stream.log.txt"

SID=$(grep -o '"sessionId":"sess_[a-z0-9_]*"' "$WORK/sse1.txt" | head -1 | cut -d'"' -f4)
say "sessionId=$SID"

say ""
say "== 2. DS3a: GET /api/sessions/:id 读回（无凭证）=="
curl -s -m 30 "http://localhost:$PORT/api/sessions/$SID" > "$WORK/sess1.json"
python3 -c "
import json,sys
d=json.load(open('$WORK/sess1.json'))
print('ok:', d.get('ok'), '| sessionId:', d['session']['id'])
for m in d['messages']: print(' ', m['role'], '→', m['content'][:60].replace(chr(10),' '))
" >> "$LOG" 2>&1
cp "$WORK/sess1.json" "$EV/e2e-session-readback-restart.log.txt"

say ""
say "== 3. 对照: 白名单外端点无凭证仍 401（中间件在岗证明）+ consult 非 401 =="
say "GET /api/ga/calibration → HTTP $(curl -s -m 10 -o /dev/null -w '%{http_code}' http://localhost:$PORT/api/ga/calibration)（期望 401）"
say "POST /api/diagnosis/consult 无凭证 → HTTP $(curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"teamId":"t","initiator":{"role":"GA"}}' http://localhost:$PORT/api/diagnosis/consult)（非 401 即白名单生效）"

say ""
say "== 4. DS8: upload-v2 四路径 410 GONE（真实服务器）=="
for m in "POST /api/diagnosis/upload" "GET /api/diagnosis/status/job-1" "GET /api/diagnosis/report/job-1" "POST /api/diagnosis/interview"; do
  set -- $m
  say "$m → HTTP $(curl -s -m 10 -o /dev/null -w '%{http_code}' -X $1 http://localhost:$PORT$2)（期望 410）"
done
say "POST /api/diagnosis/upload 响应体:"
curl -s -m 10 -X POST http://localhost:$PORT/api/diagnosis/upload >> "$LOG" 2>&1
say ""

# ── 重启服务器（同 db）──
kill $SRV_PID 2>/dev/null; wait $SRV_PID 2>/dev/null  # swallow-ok: 重启前停服（信号竞态可容忍）
sleep 2
SRV_START "$WORK/server2.log" || { say "SERVER-2 重启失败"; tail -20 "$WORK/server2.log" >> "$LOG"; exit 1; }

say ""
say "== 5. DS3b: 服务器重启后同会话仍可查（持久化跨重启）=="
curl -s -m 30 "http://localhost:$PORT/api/sessions/$SID" > "$WORK/sess2.json"
python3 - "$WORK/sess1.json" "$WORK/sess2.json" <<'PYEOF' 2>&1 | tee -a "$LOG"
import json, sys
a = json.load(open(sys.argv[1])); b = json.load(open(sys.argv[2]))
# 只比对话消息（user/assistant）；重启后可能多一条 system 消息——restart-recovery 平台既有行为
ma = [(m['role'], m['content']) for m in a['messages'] if m['role'] != 'system']
mb = [(m['role'], m['content']) for m in b['messages'] if m['role'] != 'system']
extra = [m for m in b['messages'] if m['role'] == 'system']
print('重启前对话消息:', len(ma), '| 重启后对话消息:', len(mb), '| 逐条一致:', ma == mb)
print('重启后 system 消息（restart-recovery 平台行为）:', [m['content'][:40] for m in extra] if extra else '无')
print('结论: DS3 重启持久化', 'PASS' if ma == mb and len(ma) >= 2 else 'FAIL')
PYEOF

kill $SRV_PID $LLM_PID 2>/dev/null   # swallow-ok: 采集完成收尾
wait $SRV_PID $LLM_PID 2>/dev/null   # swallow-ok: 同上
say ""
say "== 6. 服务器日志尾部（server1，含 bootstrap 降级情况）=="
tail -5 "$WORK/server1.log" >> "$LOG" 2>&1
lsof -ti :$PORT | xargs kill 2>/dev/null  # swallow-ok: 收尾清理（进程可能已退出）
say "DONE"
