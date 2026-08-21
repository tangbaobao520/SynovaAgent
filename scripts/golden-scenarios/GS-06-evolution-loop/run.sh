#!/bin/bash
# GS-06 进化闭环场景 — 反馈注入 → 候选池 → 运行状态（loop-3/5 真实执行体）
# 运行契约（GSS 设计 §2.2 8 条）：fresh-db / bootstrap / inject / trigger / assert / evidence / exit / 幂等
# 说明（D447，2026-08-21）：
#   · 进化闭环链路 = POST /api/evolution/feedback/collect（反馈注入）
#                    → GET /api/evolution/proposals（候选池）
#                    → GET /api/evolution/status（运行状态）
#   · D333 loop-3/5 真实执行体已在 main（6279f451，middle-evolution-engine + ga-evolution）
#   · 三个机器判定断言：① feedback 注入 ok ② proposals 端点可达（ok + count 字段）
#     ③ status 端点可达（ok + counters/metrics 快照）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DATE="$(date +%Y-%m-%d)"

# 0. 自举 JWT（真实客户端行为，复用 GS-03 D462 模式）
JWT_SECRET="gs06-$(date +%s)-$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
export JWT_SECRET
GS_TOKEN="$(node -e '
  const crypto = require("crypto");
  const secret = process.env.JWT_SECRET;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = b64({ sub: "gs06-scenario", role: "admin", orgId: "default", iat: now, exp: now + 3600, jti: "gs06-" + now });
  const sig = crypto.createHmac("sha256", secret).update(header + "." + payload).digest("base64url");
  process.stdout.write(header + "." + payload + "." + sig);
')"
AUTH_HEADER="Authorization: Bearer $GS_TOKEN"
echo "[GS-06] JWT_SECRET 已自举（长度 ${#JWT_SECRET}），token 已签发"

# 1. fresh-db（临时库，测后删除；真实库只读；禁止 cp data/synova.db——铁律 0-4）
DATA_DIR="$(cd "$REPO_ROOT" && npx tsx "$COMMON_DIR/fresh-db.ts")"
echo "[GS-06] 临时数据目录: $DATA_DIR"

export SYNOVA_DB_PATH="$DATA_DIR/synova.db"

cleanup() {
  if [[ -f "$DATA_DIR/bootstrap-state.json" ]]; then
    pid="$(python3 -c "import json;print(json.load(open('$DATA_DIR/bootstrap-state.json'))['pid'])" 2>/dev/null || echo "")"
    if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; fi
  fi
  rm -rf "$DATA_DIR" 2>/dev/null || true
  rm -f "$SCRIPT_DIR/expect.runtime.json"
}
trap cleanup EXIT

# 2. bootstrap（临时端口 + healthz 就绪探测）
(cd "$REPO_ROOT" && npx tsx "$COMMON_DIR/bootstrap.ts" --data-dir "$DATA_DIR" --timeout 120 \
  > "$DATA_DIR/bootstrap.log" 2>&1 &)
BOOT_STATE="$DATA_DIR/bootstrap-state.json"
BOOT_READY=""
for _ in $(seq 1 60); do
  if [ -f "$BOOT_STATE" ]; then BOOT_READY="yes"; break; fi
  sleep 2
done
if [ -z "$BOOT_READY" ]; then
  echo "[GS-06] ❌ bootstrap 超时（120s 未就绪）— 日志尾:"
  tail -5 "$DATA_DIR/bootstrap.log" 2>/dev/null || true
  exit 2
fi
PORT="$(python3 -c "import json;print(json.load(open('$BOOT_STATE'))['port'])")"
BASE="http://127.0.0.1:$PORT"
echo "[GS-06] 服务就绪: $BASE"

# 3. 触发 1：反馈注入（loop-3/5 数据源）
curl -sS -o "$DATA_DIR/feedback-response.json" -w "%{http_code}" \
  -X POST "$BASE/api/evolution/feedback/collect" \
  -H 'Content-Type: application/json' \
  -H "$AUTH_HEADER" \
  > "$DATA_DIR/feedback-status.txt" 2>&1 || true
echo "[GS-06] feedback/collect HTTP 状态: $(cat "$DATA_DIR/feedback-status.txt")"
echo "[GS-06] feedback 响应: $(cat "$DATA_DIR/feedback-response.json")"

# 4. 触发 2：候选池（proposals）
curl -sS -o "$DATA_DIR/proposals-response.json" -w "%{http_code}" \
  -H "$AUTH_HEADER" \
  "$BASE/api/evolution/proposals" \
  > "$DATA_DIR/proposals-status.txt" 2>&1 || true
echo "[GS-06] proposals HTTP 状态: $(cat "$DATA_DIR/proposals-status.txt")"
echo "[GS-06] proposals 响应: $(cat "$DATA_DIR/proposals-response.json")"

# 5. 触发 3：运行状态（status）
curl -sS -o "$DATA_DIR/status-response.json" -w "%{http_code}" \
  -H "$AUTH_HEADER" \
  "$BASE/api/evolution/status" \
  > "$DATA_DIR/status-status.txt" 2>&1 || true
echo "[GS-06] status HTTP 状态: $(cat "$DATA_DIR/status-status.txt")"
echo "[GS-06] status 响应: $(cat "$DATA_DIR/status-response.json")"

# 6. 断言（expect.json 模板 → 注入 DATA_DIR 实际路径）
sed "s|__DATA_DIR__|$DATA_DIR|g" "$SCRIPT_DIR/expect.json" > "$SCRIPT_DIR/expect.runtime.json"

cd "$REPO_ROOT"
set +e
npx tsx "$COMMON_DIR/assert.ts" \
  --expect "$SCRIPT_DIR/expect.runtime.json" \
  --out "$REPO_ROOT/scripts/golden-scenarios/evidence/GS-06-$DATE.json"
ASSERT_EXIT=$?
set -e
echo "[GS-06] 断言 exit: $ASSERT_EXIT"
exit "$ASSERT_EXIT"
