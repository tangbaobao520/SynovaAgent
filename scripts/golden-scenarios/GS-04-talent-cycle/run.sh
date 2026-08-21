#!/bin/bash
# GS-04 人才循环场景 — hr-standard 注入 → key-person-risk 越阈告警
# 运行契约（设计 §2.2 8 条）+ D462 修复链（JWT/SYNOVA_DB_PATH/后台 bootstrap）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DATE="$(date +%Y-%m-%d)"

JWT_SECRET="gs04-$(date +%s)-$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
export JWT_SECRET
GS_TOKEN="$(node -e '
  const crypto = require("crypto");
  const secret = process.env.JWT_SECRET;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = b64({ sub: "gs04-scenario", role: "admin", orgId: "default", iat: now, exp: now + 3600, jti: "gs04-" + now });
  const sig = crypto.createHmac("sha256", secret).update(header + "." + payload).digest("base64url");
  process.stdout.write(header + "." + payload + "." + sig);
')"
AUTH_HEADER="Authorization: Bearer $GS_TOKEN"
echo "[GS-04] JWT_SECRET 已自举（长度 ${#JWT_SECRET}），token 已签发"

DATA_DIR="$(cd "$REPO_ROOT" && npx tsx "$COMMON_DIR/fresh-db.ts")"
echo "[GS-04] 临时数据目录: $DATA_DIR"
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

(cd "$REPO_ROOT" && npx tsx "$COMMON_DIR/bootstrap.ts" --data-dir "$DATA_DIR" --timeout 120 \
  > "$DATA_DIR/bootstrap.log" 2>&1 &)
BOOT_STATE="$DATA_DIR/bootstrap-state.json"
BOOT_READY=""
for _ in $(seq 1 60); do
  if [ -f "$BOOT_STATE" ]; then BOOT_READY="yes"; break; fi
  sleep 2
done
if [ -z "$BOOT_READY" ]; then
  echo "[GS-04] ❌ bootstrap 超时 — 日志尾:"
  tail -5 "$DATA_DIR/bootstrap.log" 2>/dev/null || true
  exit 2
fi
PORT="$(python3 -c "import json;print(json.load(open('$BOOT_STATE'))['port'])")"
BASE="http://127.0.0.1:$PORT"
echo "[GS-04] 服务就绪: $BASE"

# 负向基线：空库触发 key-person-risk（无数据 → 无 critical）
curl -sS -X POST "$BASE/api/sentinel/run/key-person-risk" > "$DATA_DIR/run-empty-response.json" 2>&1 || true
echo "[GS-04] 空库触发响应: $(cat "$DATA_DIR/run-empty-response.json")"

# inject hr-standard fixture（Person 节点；高关键岗位占比 → 关键人风险）
curl -sS -X POST "$BASE/api/data/upload" \
  -H 'Content-Type: application/json' \
  -H "$AUTH_HEADER" \
  -d "{\"mapping\":\"hr-standard\",\"rows\":[$(cat "$SCRIPT_DIR/fixtures/hr-key-person.json")],\"graph\":\"default\"}" \
  > "$DATA_DIR/upload-response.json" 2>&1 || true
echo "[GS-04] 注入响应: $(cat "$DATA_DIR/upload-response.json")"

# 触发 key-person-risk 哨兵（Bus Factor / 决策集中度）
curl -sS -X POST "$BASE/api/sentinel/run/key-person-risk" > "$DATA_DIR/run-response.json" 2>&1 || true
echo "[GS-04] 触发响应: $(cat "$DATA_DIR/run-response.json")"

sed "s|__DATA_DIR__|$DATA_DIR|g" "$SCRIPT_DIR/expect.json" > "$SCRIPT_DIR/expect.runtime.json"
cd "$REPO_ROOT"
set +e
npx tsx "$COMMON_DIR/assert.ts" \
  --expect "$SCRIPT_DIR/expect.runtime.json" \
  --out "$REPO_ROOT/scripts/golden-scenarios/evidence/GS-04-$DATE.json"
ASSERT_EXIT=$?
set -e
echo "[GS-04] 断言 exit: $ASSERT_EXIT"
exit "$ASSERT_EXIT"
