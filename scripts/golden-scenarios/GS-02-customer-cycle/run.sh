#!/bin/bash
# GS-02 客户循环场景 — crm-standard 注入 → customer-demand-shift 越阈告警
# 运行契约（设计 §2.2 8 条）：fresh-db / bootstrap / inject / trigger / assert / evidence / exit / 幂等
# 模式对齐 GS-03/GS-05（D462 修复链）：JWT 自举 + SYNOVA_DB_PATH 隔离 + 后台 bootstrap 轮询
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DATE="$(date +%Y-%m-%d)"

# 0. 自举 JWT（bootstrap 强制 DEV_MODE=false → upload 需鉴权）
JWT_SECRET="gs02-$(date +%s)-$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
export JWT_SECRET
GS_TOKEN="$(node -e '
  const crypto = require("crypto");
  const secret = process.env.JWT_SECRET;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = b64({ sub: "gs02-scenario", role: "admin", orgId: "default", iat: now, exp: now + 3600, jti: "gs02-" + now });
  const sig = crypto.createHmac("sha256", secret).update(header + "." + payload).digest("base64url");
  process.stdout.write(header + "." + payload + "." + sig);
')"
AUTH_HEADER="Authorization: Bearer $GS_TOKEN"
echo "[GS-02] JWT_SECRET 已自举（长度 ${#JWT_SECRET}），token 已签发"

# 1. fresh-db（临时库，测后删除；真实库只读；禁止 cp data/synova.db——铁律 0-4）
DATA_DIR="$(cd "$REPO_ROOT" && npx tsx "$COMMON_DIR/fresh-db.ts")"
echo "[GS-02] 临时数据目录: $DATA_DIR"
export SYNOVA_DB_PATH="$DATA_DIR/synova.db"   # 防开发者 env 泄漏写真实库（D462 修复链）

cleanup() {
  if [[ -f "$DATA_DIR/bootstrap-state.json" ]]; then
    pid="$(python3 -c "import json;print(json.load(open('$DATA_DIR/bootstrap-state.json'))['pid'])" 2>/dev/null || echo "")"
    if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; fi
  fi
  rm -rf "$DATA_DIR" 2>/dev/null || true
  rm -f "$SCRIPT_DIR/expect.runtime.json"
}
trap cleanup EXIT

# 2. bootstrap（后台拉起 + 轮询 state——bootstrap.ts 起服务后进程不退出）
(cd "$REPO_ROOT" && npx tsx "$COMMON_DIR/bootstrap.ts" --data-dir "$DATA_DIR" --timeout 120 \
  > "$DATA_DIR/bootstrap.log" 2>&1 &)
BOOT_STATE="$DATA_DIR/bootstrap-state.json"
BOOT_READY=""
for _ in $(seq 1 60); do
  if [ -f "$BOOT_STATE" ]; then BOOT_READY="yes"; break; fi
  sleep 2
done
if [ -z "$BOOT_READY" ]; then
  echo "[GS-02] ❌ bootstrap 超时（120s 未就绪）— 日志尾:"
  tail -5 "$DATA_DIR/bootstrap.log" 2>/dev/null || true
  exit 2
fi
PORT="$(python3 -c "import json;print(json.load(open('$BOOT_STATE'))['port'])")"
BASE="http://127.0.0.1:$PORT"
echo "[GS-02] 服务就绪: $BASE"

# 3. 负向基线：空库触发 customer-demand-shift（无数据 → 无越阈告警，降级不误报）
curl -sS -X POST "$BASE/api/sentinel/run/customer-demand-shift" > "$DATA_DIR/run-empty-response.json" 2>&1 || true
echo "[GS-02] 空库触发响应: $(cat "$DATA_DIR/run-empty-response.json")"

# 4. inject crm-standard fixture（Client 节点；高流失 + 低 NPS + 高集中度）
curl -sS -X POST "$BASE/api/data/upload" \
  -H 'Content-Type: application/json' \
  -H "$AUTH_HEADER" \
  -d "{\"mapping\":\"crm-standard\",\"rows\":[$(cat "$SCRIPT_DIR/fixtures/crm-shift.json")],\"graph\":\"default\"}" \
  > "$DATA_DIR/upload-response.json" 2>&1 || true
echo "[GS-02] 注入响应: $(cat "$DATA_DIR/upload-response.json")"

# 5. 触发 customer-demand-shift 哨兵（越阈 → critical）
curl -sS -X POST "$BASE/api/sentinel/run/customer-demand-shift" > "$DATA_DIR/run-response.json" 2>&1 || true
echo "[GS-02] 触发响应: $(cat "$DATA_DIR/run-response.json")"

# 6. 断言（expect.json 模板 → 注入 DATA_DIR 实际路径）
sed "s|__DATA_DIR__|$DATA_DIR|g" "$SCRIPT_DIR/expect.json" > "$SCRIPT_DIR/expect.runtime.json"

cd "$REPO_ROOT"
set +e
npx tsx "$COMMON_DIR/assert.ts" \
  --expect "$SCRIPT_DIR/expect.runtime.json" \
  --out "$REPO_ROOT/scripts/golden-scenarios/evidence/GS-02-$DATE.json"
ASSERT_EXIT=$?
set -e
echo "[GS-02] 断言 exit: $ASSERT_EXIT"
exit "$ASSERT_EXIT"
