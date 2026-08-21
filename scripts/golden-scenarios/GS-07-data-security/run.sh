#!/bin/bash
# GS-07 数据安全场景 — 敏感数据 → PII 脱敏 + 越权拒绝
# 运行契约（GSS 设计 §2.2 8 条）：fresh-db / bootstrap / inject / trigger / assert / evidence / exit / 幂等
# 说明（D448，2026-08-21）：
#   · 前置 D338（orgId 契约网关）未落地 —— 诚实 RED，本场景覆盖已就绪的安全能力：
#     PIIScrubber（src/security/pii-scrubber.ts）+ RBAC 越权拒绝（src/middleware/rbac.ts）
#   · 三个机器判定断言：
#     ① PII 脱敏：scrub(S2) → 姓名→[姓名]、手机号→[手机号]（敏感数据脱敏）
#     ② 越权拒绝：无权限访问 private workspace → HTTP 403（RBAC fail-closed）
#     ③ 边界：scrub(S1) → 姓名保持原文（敏感度级别正确）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DATE="$(date +%Y-%m-%d)"

# 0. 自举 JWT（真实客户端行为，复用 GS-03 D462 模式）
JWT_SECRET="gs07-$(date +%s)-$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
export JWT_SECRET
GS_TOKEN="$(node -e '
  const crypto = require("crypto");
  const secret = process.env.JWT_SECRET;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = b64({ sub: "gs07-scenario", role: "staff", orgId: "default", iat: now, exp: now + 3600, jti: "gs07-" + now });
  const sig = crypto.createHmac("sha256", secret).update(header + "." + payload).digest("base64url");
  process.stdout.write(header + "." + payload + "." + sig);
')"
AUTH_HEADER="Authorization: Bearer $GS_TOKEN"
echo "[GS-07] JWT_SECRET 已自举（长度 ${#JWT_SECRET}），token 已签发（role=staff）"

# 1. fresh-db（临时库，测后删除；真实库只读；禁止 cp data/synova.db——铁律 0-4）
DATA_DIR="$(cd "$REPO_ROOT" && npx tsx "$COMMON_DIR/fresh-db.ts")"
echo "[GS-07] 临时数据目录: $DATA_DIR"

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

# 2. PII 脱敏验证（纯函数级，不依赖服务）
cd "$REPO_ROOT"
npx tsx -e "
import { getPIIScrubber } from './src/security/pii-scrubber';
import * as fs from 'fs';
const scrubber = getPIIScrubber();
const text = '张三的月薪 15000 元，联系电话 13800138000，邮箱 zhangsan@example.com';
const r2 = scrubber.scrub(text, 'S2');
fs.writeFileSync('$DATA_DIR/pii-s2.json', JSON.stringify({ cleaned: r2.cleaned, matchCount: r2.matches.length }));
const r1 = scrubber.scrub('张三的月薪 15000 元', 'S1');
fs.writeFileSync('$DATA_DIR/pii-s1.json', JSON.stringify({ cleaned: r1.cleaned }));
" > "$DATA_DIR/pii.log" 2>&1
echo "[GS-07] S2 脱敏: $(cat "$DATA_DIR/pii-s2.json")"
echo "[GS-07] S1 边界: $(cat "$DATA_DIR/pii-s1.json")"

# 3. bootstrap（临时端口 + healthz 就绪探测）
(cd "$REPO_ROOT" && npx tsx "$COMMON_DIR/bootstrap.ts" --data-dir "$DATA_DIR" --timeout 120 \
  > "$DATA_DIR/bootstrap.log" 2>&1 &)
BOOT_STATE="$DATA_DIR/bootstrap-state.json"
BOOT_READY=""
for _ in $(seq 1 60); do
  if [ -f "$BOOT_STATE" ]; then BOOT_READY="yes"; break; fi
  sleep 2
done
if [ -z "$BOOT_READY" ]; then
  echo "[GS-07] ❌ bootstrap 超时（120s 未就绪）— 日志尾:"
  tail -5 "$DATA_DIR/bootstrap.log" 2>/dev/null || true
  exit 2
fi
PORT="$(python3 -c "import json;print(json.load(open('$BOOT_STATE'))['port'])")"
BASE="http://127.0.0.1:$PORT"
echo "[GS-07] 服务就绪: $BASE"

# 4. 越权拒绝（staff 访问他人 private workspace → 403）
#    a) 创建 private workspace（owner=other-ga，非当前 staff）
curl -sS -o "$DATA_DIR/ws-create-response.json" -w "%{http_code}" \
  -X POST "$BASE/api/workspaces" \
  -H 'Content-Type: application/json' \
  -H "$AUTH_HEADER" \
  -d '{"title":"保密财务工作区","type":"diagnostic","visibility":"private","owner":"other-ga","department":"finance"}' \
  > "$DATA_DIR/ws-create-status.txt" 2>&1 || true
echo "[GS-07] 创建 workspace HTTP 状态: $(cat "$DATA_DIR/ws-create-status.txt")"
echo "[GS-07] 创建响应: $(cat "$DATA_DIR/ws-create-response.json")"
WS_ID="$(python3 -c "
import json
try:
    d=json.load(open('$DATA_DIR/ws-create-response.json'))
    print(d.get('workspace',{}).get('id','') or d.get('id',''))
except Exception: print('')
" 2>/dev/null || echo '')"
echo "[GS-07] workspace id: $WS_ID"
#    b) staff 访问该 private workspace → 403
curl -sS -o "$DATA_DIR/rbac-response.json" -w "%{http_code}" \
  -H "$AUTH_HEADER" \
  "$BASE/api/workspaces/$WS_ID/context" \
  > "$DATA_DIR/rbac-status.txt" 2>&1 || true
echo "[GS-07] 越权访问 HTTP 状态: $(cat "$DATA_DIR/rbac-status.txt")"
echo "[GS-07] 越权响应: $(cat "$DATA_DIR/rbac-response.json")"

# 5. 断言（expect.json 模板 → 注入 DATA_DIR 实际路径）
sed "s|__DATA_DIR__|$DATA_DIR|g" "$SCRIPT_DIR/expect.json" > "$SCRIPT_DIR/expect.runtime.json"

cd "$REPO_ROOT"
set +e
npx tsx "$COMMON_DIR/assert.ts" \
  --expect "$SCRIPT_DIR/expect.runtime.json" \
  --out "$REPO_ROOT/scripts/golden-scenarios/evidence/GS-07-$DATE.json"
ASSERT_EXIT=$?
set -e
echo "[GS-07] 断言 exit: $ASSERT_EXIT"
exit "$ASSERT_EXIT"
