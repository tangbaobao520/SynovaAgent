#!/bin/bash
# D592-run-e2e.sh — 对话闭环 E2E 一键复现 runner（spec: SYNOVA-IMPL-DSH-D592-chat-e2e-20260908.md §5.2-B）
#
# 一条命令 = 起环境 + 跑测试 + 落证据 全包（K3 独立重跑入口；幂等可重跑）:
#   bash docs/synova/product-lines/evidence/D592-run-e2e.sh
#
# 契约（铁律 47）:
#   @input  — 无必填。可选: SYNOVA_E2E_LLM_DELAY_MS（替身响应延迟 ms，默认 400——T4 忙锁/T5 断线
#             的窗口物理保障）。真实 key 复现: 注销"LLM 替身"段，LLM_BASE_URL/LLM_API_KEY 改真实值
#             并对测试置 SYNOVA_E2E_REAL_LLM=1（T6 断言升级，spec §5.2-C；替身模式断言严禁冒充真实
#             LLM 断言）。
#   @output — exit 0=两段 vitest 全绿零 skip + 3 份 evidence JSON（at=date -Iseconds 生成，禁手抄）
#             + 2 份 vitest 全量日志落本目录（D592-e2e-create/resume.log.txt，覆盖写）。
#   @degraded — Node 非 22 主版本 → 显式报错退出（better-sqlite3 ABI=127，Node 24 全量假败 350 例，
#             D589 实证——不静默带病运行）；server 探活失败 → 收集现场日志后 exit 1；任何一段含
#             skip/failed → exit 1（零 skip 是证据有效性的硬前提）。
#
# 环境坑（编码指令 ⑥）: ① Node 22 ABI 锁；② CI 排除 tests/e2e/——证据只能来自本 runner 实跑；
# ③ 3099/9201 残留进程——端口幂等预清理；④ 重启段先证端口真释放（探活必须先失败再成功），
# 否则旧进程占端口 = 假重启（sessionEngines 进程内缓存测不到 fromState 路径）。
set -uo pipefail
cd "$(dirname "$0")/../../../.."   # → 仓库根（evidence 目录向上 4 层）

EV=docs/synova/product-lines/evidence
PORT=3099
LLMPORT=9201
DELAY="${SYNOVA_E2E_LLM_DELAY_MS:-400}"

# ── ① Node 22 主版本检查（D589 ABI 教训；非 22 → 找 nvm v22.*，仍无 → 显式报错）──
node_major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
NODE_BIN="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE_BIN" ] || [ "$(node_major "$NODE_BIN")" != "22" ]; then
  for cand in "$HOME"/.nvm/versions/node/v22.*/bin; do
    if [ -x "$cand/node" ] && [ "$(node_major "$cand/node")" = "22" ]; then
      export PATH="$cand:$PATH"
      NODE_BIN="$cand/node"
      break
    fi
  done
fi
if [ -z "$NODE_BIN" ] || [ "$(node_major "$NODE_BIN")" != "22" ]; then
  echo "FAIL: 需要 Node 22（better-sqlite3 编译于 NODE_MODULE_VERSION 127；其他主版本会全量假败）。" >&2
  echo "      当前: ${NODE_BIN:-无 node} $(${NODE_BIN:-echo} -p process.versions.node 2>/dev/null || echo '?')；请 nvm install 22 && nvm use 22 后重跑。" >&2
  exit 1
fi
echo "== D592 E2E runner == Node $(node -p 'process.versions.node')（ABI 127 锁满足）"

# ── ② scratch + 端口幂等预清理 + 退出清理 ──
WORK="$(mktemp -d /tmp/d592-e2e.XXXXXX)"
cleanup() {
  [ -n "${SRV_PID:-}" ] && { kill "$SRV_PID" 2>/dev/null; wait "$SRV_PID" 2>/dev/null; }   # swallow-ok: 收尾停服（可能已退出）
  [ -n "${LLM_PID:-}" ] && { kill "$LLM_PID" 2>/dev/null; wait "$LLM_PID" 2>/dev/null; }   # swallow-ok: 同上
  lsof -ti :"$PORT" 2>/dev/null | xargs kill 2>/dev/null   # swallow-ok: 探测型端口清理
  lsof -ti :"$LLMPORT" 2>/dev/null | xargs kill 2>/dev/null # swallow-ok: 同上
  rm -rf "$WORK"
}
trap cleanup EXIT

lsof -ti :"$PORT" 2>/dev/null | xargs kill 2>/dev/null   # swallow-ok: 幂等预清理（残留进程）
lsof -ti :"$LLMPORT" 2>/dev/null | xargs kill 2>/dev/null # swallow-ok: 同上
sleep 1

# ── ③ LLM 替身（OpenAI 兼容 /chat/completions；消息计数探针 + 可调延迟——T3/T9 多轮上下文
#      物理证明的探针: content 含"第 n 次请求（历史 m 条消息）"，m=请求体 messages 数组长度）──
node -e '
const http = require("http");
const delay = Number(process.argv[2]) || 400;
let n = 0;
http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => { b += c; });
  req.on("end", () => {
    n += 1;
    let m = 0;
    try { const body = JSON.parse(b); if (Array.isArray(body.messages)) m = body.messages.length; } catch (e) { m = 0; }
    const content = "已收到本会话第 " + n + " 次请求（历史 " + m + " 条消息）。收到，我已记录，请继续介绍团队情况。";
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

# ── ④ server 启动（scratch env 契约，D590 先例）+ 探活 ≤90s ──
SRV_START() {
  SYNOVA_DB_PATH="$WORK/d592.db" SYNOVA_DATA_DIR="$WORK" \
  DEV_MODE=false JWT_SECRET=d592-e2e-scratch-secret \
  LLM_API_KEY=d592-standin LLM_BASE_URL="http://127.0.0.1:$LLMPORT" LLM_MODEL=d592-standin-model \
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

# ── ⑤ 段1: 创建段（T1-T8）——vitest 全量输出 tee 落 evidence/ ──
SYNOVA_E2E_STATE="$WORK/d592-state.json" PORT="$PORT" \
  npx vitest run tests/e2e/conversation-flow.e2e.test.ts 2>&1 | tee "$EV/D592-e2e-create.log.txt"
CREATE_RC=$?

# ── ⑧ 零 skip/零 failed/passed>0 三重校验（证据有效性硬前提）──
check_segment() { # $1=log $2=名称 $3=rc
  if [ "$3" -ne 0 ]; then
    echo "FAIL: $2 vitest exit=$3（现场: server 日志尾行如下）"; tail -20 "$WORK/server1.log" >&2; exit 1
  fi
  if grep -Eq '[1-9][0-9]* skipped' "$1"; then
    echo "FAIL: $2 含 skip（skip 与证据互斥——server 未启动或段开关错误）"; grep -E 'skip' "$1" | head -5 >&2; exit 1
  fi
  if grep -Eq '[1-9][0-9]* failed' "$1"; then
    echo "FAIL: $2 含 failed"; grep -E 'FAIL |failed' "$1" | head -10 >&2; exit 1
  fi
  if ! grep -Eq '[1-9][0-9]* passed' "$1"; then
    echo "FAIL: $2 零 passed（异常空跑）"; exit 1
  fi
}
check_segment "$EV/D592-e2e-create.log.txt" "创建段" "$CREATE_RC"

# ── ⑥ 物理重启: 真杀进程 + 证端口真释放（探活必须先失败）+ 同 scratch DB 重启 ──
kill "$SRV_PID" 2>/dev/null; wait "$SRV_PID" 2>/dev/null   # swallow-ok: 重启前停服（信号竞态可容忍）
sleep 1
for _ in $(seq 1 10); do
  if curl -s -m 1 -o /dev/null "http://localhost:$PORT/api/healthz"; then
    lsof -ti :"$PORT" 2>/dev/null | xargs kill 2>/dev/null   # swallow-ok: npx 子进程残留清除
    sleep 1
  else
    break  # 探活失败 = 端口真释放，无假重启
  fi
done
if curl -s -m 1 -o /dev/null "http://localhost:$PORT/api/healthz"; then
  echo "FAIL: 重启前端口 $PORT 仍存活——旧进程未退，重启将是假的（sessionEngines 缓存未失效）"; exit 1
fi
SRV_START "$WORK/server2.log" || { echo "FAIL: server-2 重启失败"; tail -30 "$WORK/server2.log" >&2; exit 1; }
echo "== 段2 环境: server 已物理重启（同 scratch DB: $WORK/d592.db）=="

# ── ⑦ 段2: 恢复段（RESUME=1 + state 文件）──
SYNOVA_E2E_RESUME=1 SYNOVA_E2E_STATE="$WORK/d592-state.json" PORT="$PORT" \
  npx vitest run tests/e2e/conversation-flow.e2e.test.ts 2>&1 | tee "$EV/D592-e2e-resume.log.txt"
RESUME_RC=$?
check_segment "$EV/D592-e2e-resume.log.txt" "恢复段" "$RESUME_RC"

# ── ⑨ evidence JSON 生成（runner 模板生成，at=date -Iseconds 禁手抄；quote 全部物理数字，
#      提取失败即报错退出——证据不允许静默缺数字）──
kv() { # $1=log $2=key → 输出 key=value 的 value 部分（取首个；key 取尾字段防 sessionId 内数字污染）
  grep -Eo "${2}=[^ ]+" "$1" 2>/dev/null | head -1 | cut -d= -f2-
}
require_kv() { [ -n "$2" ] || { echo "FAIL: evidence 物理数字提取失败: $1（日志格式漂移? 检查 [D592-EVID] 行）"; exit 1; }; }

# 摘要计数锚定 vitest "Tests  N passed" 行（"Test Files 1 passed" 在前，宽松 grep 会取错行）
CREATE_PASSED="$(grep -E 'Tests +[0-9]+ passed' "$EV/D592-e2e-create.log.txt" 2>/dev/null | head -1 | grep -Eo '[0-9]+ passed' | grep -Eo '^[0-9]+')"
RESUME_PASSED="$(grep -E 'Tests +[0-9]+ passed' "$EV/D592-e2e-resume.log.txt" 2>/dev/null | head -1 | grep -Eo '[0-9]+ passed' | grep -Eo '^[0-9]+')"
T1_TOKENS="$(kv "$EV/D592-e2e-create.log.txt" 'tokens')"
T3_M1="$(kv "$EV/D592-e2e-create.log.txt" 'hist_m1')"
T3_M2="$(kv "$EV/D592-e2e-create.log.txt" 'hist_m2')"
T5_SEEN="$(kv "$EV/D592-e2e-create.log.txt" 'seenTokens')"
T6_DIAG="$(kv "$EV/D592-e2e-create.log.txt" 'diagEvents')"
T6_TERM="$(kv "$EV/D592-e2e-create.log.txt" 'terminal')"
T9_BASE="$(kv "$EV/D592-e2e-resume.log.txt" 'base')"
T9_RESUMED="$(kv "$EV/D592-e2e-resume.log.txt" 'resumed')"
T9_M="$(kv "$EV/D592-e2e-resume.log.txt" 'hist_m')"

require_num() { [ -n "$2" ] || { echo "FAIL: evidence 物理数字提取失败: $1（日志格式漂移? 检查 [D592-EVID] 行）"; exit 1; }; }
require_num "create passed" "$CREATE_PASSED"
require_num "resume passed" "$RESUME_PASSED"
require_num "T1 tokens" "$T1_TOKENS"
require_num "T3 m1" "$T3_M1"
require_num "T3 m2" "$T3_M2"
require_num "T5 seenTokens" "$T5_SEEN"
require_num "T6 diagEvents" "$T6_DIAG"
require_num "T6 terminal" "$T6_TERM"
require_num "T9 base" "$T9_BASE"
require_num "T9 resumed" "$T9_RESUMED"
require_num "T9 hist_m" "$T9_M"

GIT_HEAD="$(git rev-parse --short HEAD)"
NODE_VER="$(node -p 'process.versions.node')"
AT="$(date -Iseconds)"
DATE="$(date +%F)"
SOURCE="bash docs/synova/product-lines/evidence/D592-run-e2e.sh @ ${GIT_HEAD}（Node v${NODE_VER}；本地 OpenAI 兼容替身 :${LLMPORT} + 真实 server :${PORT} DEV_MODE=false + scratch DB 双段物理重启；K3 真实 key 复现=替换身改 LLM_BASE_URL/LLM_API_KEY 两行 env + SYNOVA_E2E_REAL_LLM=1）"
TEST_REF="tests/e2e/conversation-flow.e2e.test.ts"
CREATE_LOG_REF="docs/synova/product-lines/evidence/D592-e2e-create.log.txt"
RESUME_LOG_REF="docs/synova/product-lines/evidence/D592-e2e-resume.log.txt"

gen_json() { # $1=out $2=point $3=note $4=quote $5=quote_ref（经 env 传参——node -e 的 argv[1]=首个用户参数，slice(2) 会错位）
  D592_OUT="$1" D592_POINT="$2" D592_NOTE="$3" D592_QUOTE="$4" D592_REF="$5" \
  D592_SOURCE="$SOURCE" D592_DATE="$DATE" D592_AT="$AT" \
  node -e '
const fs = require("fs");
const env = process.env;
if (!env.D592_OUT || !env.D592_AT) { console.error("gen_json: 缺必填 env"); process.exit(1); }
const json = {
  schema: 1,
  record_type: "test",
  source: env.D592_SOURCE,
  date: env.D592_DATE,
  at: env.D592_AT,
  note: env.D592_NOTE,
  verdicts: [{ acceptance_point: env.D592_POINT, verdict: "pass", quote: env.D592_QUOTE, quote_ref: env.D592_REF }],
};
fs.writeFileSync(env.D592_OUT, JSON.stringify(json, null, 2) + "\n");
'
  [ -s "$1" ] || { echo "FAIL: evidence JSON 未落位: $1"; exit 1; }
}

gen_json "$EV/d592-e2e-2-1.json" "2-1" \
  "D592 E2E 批：对话触发诊断——3 轮访谈第 3 轮含'开始诊断'→ minTurns(3) 达标 + detectPhaseComplete 关键词命中 → 引擎'访谈完成'回复 + 诊断 DiagnosisLauncher flat 事件透传同一 SSE 流。T6 替身模式只断言桥接触发语义（访谈完成文案 + ≥1 flat 事件 + 终帧∈{complete,error} + end），不断言六阶段报告质量——真实 key 门控（SYNOVA_E2E_REAL_LLM=1 + 真实 LLM_BASE_URL）才升级 complete+report 断言（spec §5.2-C，两种模式断言强度差异如实声明）。" \
  "T6 诊断桥触发：诊断 flat 事件 ${T6_DIAG} 个、终帧=${T6_TERM}、end 终帧在位；创建段 vitest ${CREATE_PASSED} 用例全绿零 skip（真实 server 进程 + 真实落库 + 本地替身 LLM）" \
  "${TEST_REF} + ${CREATE_LOG_REF}"

gen_json "$EV/d592-e2e-2-2.json" "2-2" \
  "D592 E2E 批：回答是流式的——生产态（DEV_MODE=false 无凭证）POST /api/conversations 实流逐字 token 帧（引擎 tool-loop 逐字直通 + sleep(5)），agent_message 全文 ≡ token 串拼接（重建不变量）；T5 断线不丢证明流式已见内容可恢复（中断锚语义）。" \
  "T1 生产态闭环：token 逐字帧 ${T1_TOKENS} 帧（≥5）、帧序 open→token×N→agent_message(≡拼接)→end、帧间零 error；T5 断线不丢：abort 后已见 ${T5_SEEN} 帧 token 前缀 ⊆ 落库 assistant content；创建段 vitest ${CREATE_PASSED} 用例全绿零 skip" \
  "${TEST_REF} + ${CREATE_LOG_REF}"

gen_json "$EV/d592-e2e-2-5.json" "2-5" \
  "D592 E2E 批：多轮对话上下文不丢——替身消息计数探针（content 含'历史 m 条消息'，m=引擎请求 messages 长度）物理证明历史真实到达 provider（T3 实测 ${T3_M1}→${T3_M2}）；T9 经 runner 真杀进程 + 同 scratch DB 重启，sessionEngines 缓存未命中 → loadState→fromState 恢复路径被真实触达（spec §4.3-3 唯一形态）。已知边界如实声明：T9 断言口径=用户可见语义（读回历史连续 + 续轮 +2，spec §6 明示'不断言引擎内部计数'）——引擎模型上下文跨重启恢复存在 L2 已知缺陷（fromState 重赋值 messages 使 toolLoop 数组引用脱钩，conversations.ts:58-63 决策记录自认，provider 侧历史计数恢复后重置，T9 实测 hist_m=${T9_M}），修复归属 Stage 3（L2 演进），本批零 src/ 红线不修不掩盖。" \
  "T3 多轮：替身历史计数 ${T3_M1}→${T3_M2}（≥+2）+ 读回 4 条（2 轮 user+assistant）；T9 重启恢复：读回 ${T9_BASE} 条完整保留（首轮 user/assistant 逐字一致）+ 同 sessionId 续轮 open 回声 + 续轮后 ${T9_RESUMED} 条（+2）+ 探针往返 provider 在位；创建+恢复两段共 $((CREATE_PASSED + RESUME_PASSED)) 用例全绿零 skip" \
  "${TEST_REF} + ${CREATE_LOG_REF} + ${RESUME_LOG_REF}"

echo "== evidence 落位: d592-e2e-2-1/2-2/2-5.json（at=${AT}）+ 两段日志 =="
echo "== D592 E2E PASS: 创建段 ${CREATE_PASSED} + 恢复段 ${RESUME_PASSED} 全绿零 skip =="
exit 0
