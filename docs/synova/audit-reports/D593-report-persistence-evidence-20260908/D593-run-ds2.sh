#!/bin/bash
# D593-run-ds2.sh — DS2 物理证据一键复现 runner（spec: SYNOVA-IMPL-DSH-D593-report-persistence-20260908.md §10 DS2）
#
# 一条命令 = 起环境 + 跑真 consult + 物理杀进程 + 同 db 重启 + curl 取报告 全包（K3 独立重跑入口；幂等可重跑）:
#   bash docs/synova/audit-reports/D593-report-persistence-evidence-20260908/D593-run-ds2.sh
#
# 契约（铁律 47）:
#   @input  — 无必填。可选: D593_LLM_DELAY_MS（替身响应延迟 ms，默认 60）。
#   @output — exit 0 = DS2 通过：consult 落盘 + kill 后端口真释放 + 同 db 重启后
#             GET /api/diagnosis/consult/{reportId}/report → 200（body 含 reportId/teamId）
#             + GET ?format=markdown → 200 + GET /api/diagnosis/reports 列表含该 reportId。
#             全过程日志落本目录 *.log.txt（覆盖写；时间戳 at= date -Iseconds 生成，禁手抄）。
#   @degraded — Node 非 22 主版本 → 显式报错退出（better-sqlite3 ABI=127，D589 实证）；
#             server 探活失败 / restart 前端口未真释放 → 收集现场日志后 exit 1（不静默）。
#
# 环境坑（D592 先例）: ① Node 22 ABI 锁；② 端口幂等预清理；③ 重启段先证端口真释放
# （探活必须先失败再成功，否则旧进程占端口 = 假重启——持久层读取会被内存缓存假绿）。
# 替身模式声明: 本 runner 使用 OpenAI 兼容假端点（诚实 RED 口径，spec §10 DS2 允许）；
# 报告由真实六阶段引擎产出，断言对象是持久化与重启存活，非 LLM 内容质量。
set -uo pipefail
cd "$(dirname "$0")/../../../.."   # → 仓库根（evidence 目录向上 4 层）

EV=docs/synova/audit-reports/D593-report-persistence-evidence-20260908
PORT=3098
LLMPORT=9202
DELAY="${D593_LLM_DELAY_MS:-60}"
AT() { date -Iseconds; }

# ── ① Node 22 主版本检查（D589 ABI 教训）──
node_major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
NODE_BIN="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE_BIN" ] || [ "$(node_major "$NODE_BIN")" != "22" ]; then
  for cand in "$HOME"/.nvm/versions/node/v22.*/bin; do
    if [ -x "$cand/node" ] && [ "$(node_major "$cand/node")" = "22" ]; then
      export PATH="$cand:$PATH"; NODE_BIN="$cand/node"; break
    fi
  done
fi
if [ -z "$NODE_BIN" ] || [ "$(node_major "$NODE_BIN")" != "22" ]; then
  echo "FAIL: 需要 Node 22（better-sqlite3 ABI=127）。当前: ${NODE_BIN:-无} $(${NODE_BIN:-echo} -p process.versions.node 2>/dev/null || echo '?')" >&2
  exit 1
fi
echo "== D593 DS2 runner == Node $(node -p 'process.versions.node')（ABI 127 锁满足）== $(AT)"

# ── ② scratch + 端口幂等预清理 + 退出清理 ──
WORK="$(mktemp -d /tmp/d593-ds2.XXXXXX)"
cleanup() {
  [ -n "${SRV_PID:-}" ] && { kill -9 "$SRV_PID" 2>/dev/null; wait "$SRV_PID" 2>/dev/null; }   # swallow-ok: 收尾停服（可能已退出）
  [ -n "${LLM_PID:-}" ] && { kill "$LLM_PID" 2>/dev/null; wait "$LLM_PID" 2>/dev/null; }      # swallow-ok: 同上
  lsof -ti :"$PORT" 2>/dev/null | xargs kill -9 2>/dev/null    # swallow-ok: 探测型端口清理
  lsof -ti :"$LLMPORT" 2>/dev/null | xargs kill 2>/dev/null    # swallow-ok: 同上
  rm -rf "$WORK"
}
trap cleanup EXIT
lsof -ti :"$PORT" 2>/dev/null | xargs kill -9 2>/dev/null     # swallow-ok: 幂等预清理
lsof -ti :"$LLMPORT" 2>/dev/null | xargs kill 2>/dev/null     # swallow-ok: 同上
sleep 1

# ── ③ LLM 替身（OpenAI 兼容 /chat/completions，D592 同款）──
node -e '
const http = require("http");
const delay = Number(process.argv[2]) || 60;
let n = 0;
http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => { b += c; });
  req.on("end", () => {
    n += 1;
    const content = "DS2 替身回复（第 " + n + " 次）。团队现状已记录。";
    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }));
    }, delay);
  });
}).listen(Number(process.argv[1]), () => console.log("LLM stand-in on", process.argv[1]));
' "$LLMPORT" "$DELAY" > "$WORK/llm.log" 2>&1 &
LLM_PID=$!
sleep 1
kill -0 "$LLM_PID" 2>/dev/null || { echo "FAIL: LLM 替身启动失败"; cat "$WORK/llm.log" >&2; exit 1; }

# ── ④ server 启动（scratch env 契约，D592 先例）+ 探活 ≤90s ──
SRV_START() {
  SYNOVA_DB_PATH="$WORK/d593-ds2.db" SYNOVA_DATA_DIR="$WORK" \
  DEV_MODE=false JWT_SECRET=d593-ds2-scratch-secret \
  LLM_API_KEY=d593-standin LLM_BASE_URL="http://127.0.0.1:$LLMPORT" LLM_MODEL=d593-standin-model \
  SYNOVA_SKIP_MCP=1 PORT="$PORT" \
  npx tsx src/index.ts > "$1" 2>&1 &
  SRV_PID=$!
  for _ in $(seq 1 90); do
    curl -s -m 2 -o /dev/null "http://localhost:$PORT/api/healthz" && return 0
    sleep 1
  done
  return 1
}

SRV_START "$WORK/server1.log" || { echo "FAIL: server-1 启动失败"; tail -30 "$WORK/server1.log" >&2; exit 1; }
echo "== 段1 环境: server :$PORT + 替身 :$LLMPORT（delay=${DELAY}ms）+ scratch $WORK =="

# ── ⑤ 段1: 真 consult（SSE）→ complete 帧 reportId ──
curl -s -N --max-time 600 -D "$WORK/consult-headers.txt" \
  -X POST "http://localhost:$PORT/api/diagnosis/consult" \
  -H "Content-Type: application/json" \
  -d '{"teamId":"org-d593-ds2","initiator":{"role":"GA","name":"DS2 物理证据"}}' \
  > "$WORK/consult-sse.txt"
CONSULT_RC=$?
cp "$WORK/consult-sse.txt" "$EV/ds2-consult-sse.log.txt"
cp "$WORK/server1.log" "$EV/ds2-server-phase1.log.txt"
if [ "$CONSULT_RC" -ne 0 ]; then echo "FAIL: consult curl exit=$CONSULT_RC"; tail -20 "$WORK/server1.log" >&2; exit 1; fi
grep -q "type.*complete" "$WORK/consult-sse.txt" || { echo "FAIL: consult 无 complete 帧"; tail -5 "$WORK/consult-sse.txt" >&2; exit 1; }
REPORT_ID=$(node -e '
const fs = require("fs");
const text = fs.readFileSync(process.argv[1], "utf8");
let id = "";
for (const block of text.split("\n\n")) {
  const line = block.split("\n").find(l => l.startsWith("data: "));
  if (!line) continue;
  try { const f = JSON.parse(line.slice(6)); if (f.type === "complete" && f.report && typeof f.report.reportId === "string") id = f.report.reportId; } catch (e) {}
}
process.stdout.write(id);
' "$WORK/consult-sse.txt")
[ -n "$REPORT_ID" ] || { echo "FAIL: 未取到 reportId"; exit 1; }
CONSULT_ID=$(grep -i '^x-consult-id:' "$WORK/consult-headers.txt" | tr -d '\r' | awk '{print $2}')
echo "== 段1 完成: consultId=$CONSULT_ID reportId=$REPORT_ID @ $(AT) =="

# 进程内双路径 sanity（内存 consultId 命中 + 持久 reportId 冷读）
IN1=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/diagnosis/consult/$CONSULT_ID/report")
IN2=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/diagnosis/consult/$REPORT_ID/report")
echo "== 段1 进程内 sanity: consultId→$IN1 reportId→$IN2（双 200 预期）=="
[ "$IN1" = "200" ] && [ "$IN2" = "200" ] || { echo "FAIL: 进程内读回非 200"; exit 1; }

# ── ⑥ 物理重启: kill -9（npx 包装进程 + 按端口杀真监听 tsx 子进程）+ 证端口真释放 + 同 scratch DB 重启 ──
kill -9 "$SRV_PID" 2>/dev/null   # swallow-ok: npx 包装层（tsx 子进程按端口补杀）
for _ in $(seq 1 10); do
  lsof -ti :"$PORT" 2>/dev/null | xargs kill -9 2>/dev/null   # swallow-ok: 杀真实监听进程
  sleep 1
  curl -s -m 2 -o /dev/null "http://localhost:$PORT/api/healthz" || break
done
wait "$SRV_PID" 2>/dev/null   # swallow-ok: 回收包装进程
if curl -s -m 2 -o /dev/null "http://localhost:$PORT/api/healthz"; then
  echo "FAIL: 重启前端口仍可达 — 旧进程占用 = 假重启"; exit 1
fi
echo "== 端口 $PORT 已真释放（探活先失败）== $(AT) =="
SRV_START "$WORK/server2.log" || { echo "FAIL: server-2 重启失败"; tail -30 "$WORK/server2.log" >&2; exit 1; }
echo "== 段2: 同 scratch DB 重启完成 @ $(AT) =="

# ── ⑦ 段2: 重启后 GET report（DS2 核心断言）+ markdown + 列表 ──
{
  echo "DS2 物理重启读回证据 @ $(date -Iseconds)"
  echo "reportId=$REPORT_ID consultId=$CONSULT_ID"
  echo "--- GET /api/diagnosis/consult/$REPORT_ID/report （重启后） ---"
  curl -s -w '\nHTTP_STATUS=%{http_code}\n' "http://localhost:$PORT/api/diagnosis/consult/$REPORT_ID/report"
  echo "--- GET 同路径 ?format=markdown ---"
  curl -s -w '\nHTTP_STATUS=%{http_code}\n' "http://localhost:$PORT/api/diagnosis/consult/$REPORT_ID/report?format=markdown"
  echo "--- GET /api/diagnosis/reports?limit=5 （列表含该 reportId） ---"
  curl -s -w '\nHTTP_STATUS=%{http_code}\n' "http://localhost:$PORT/api/diagnosis/reports?limit=5"
  echo "--- 对照: 未知 id 应 404 ---"
  curl -s -w '\nHTTP_STATUS=%{http_code}\n' "http://localhost:$PORT/api/diagnosis/consult/ghost/report"
} > "$EV/ds2-restart-readback.log.txt" 2>&1
cp "$WORK/server2.log" "$EV/ds2-server-phase2.log.txt"

# ── ⑧ 断言（物理证据有效性硬前提）──
READBACK="$EV/ds2-restart-readback.log.txt"
grep -q "HTTP_STATUS=200" "$READBACK" || { echo "FAIL: 重启后 GET report 非 200"; cat "$READBACK" >&2; exit 1; }
grep -q "\"reportId\":\"$REPORT_ID\"" "$READBACK" || { echo "FAIL: 响应 body 无该 reportId"; cat "$READBACK" >&2; exit 1; }
grep -q "org-d593-ds2" "$READBACK" || { echo "FAIL: 响应 body 无 teamId"; exit 1; }
grep -q '"total":[1-9]' "$READBACK" || { echo "FAIL: 重启后列表 total=0"; exit 1; }
grep -q "HTTP_STATUS=404" "$READBACK" || { echo "FAIL: 对照探针未 404"; exit 1; }
echo "== DS2 PASS: 诊断→杀进程(-9)→重启→GET 200（报告重启存活）== $(AT) =="
echo "证据文件: $EV/ds2-consult-sse.log.txt / ds2-restart-readback.log.txt / ds2-server-phase{1,2}.log.txt"
exit 0
