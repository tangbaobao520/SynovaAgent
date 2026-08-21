#!/bin/bash
# GS-03 资本循环场景 — erp-standard 数据注入 → cash-runway 阈值告警
# 运行契约（设计 §2.2 8 条）：fresh-db / bootstrap / inject / trigger / assert / evidence / exit / 幂等
# 修复（2026-08-21，D462 环境修复链）：① JWT 自举（bootstrap 强制 DEV_MODE=false → upload 需鉴权）
#   ② SYNOVA_DB_PATH 显式指向临时库（防开发者 env 泄漏到真实库，铁律 0-4）
#   ③ bootstrap 后台拉起 + 轮询 state（bootstrap.ts 起服务后进程不退出，命令替换会挂起）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DATE="$(date +%Y-%m-%d)"

# 0. 自举 JWT（真实客户端行为）：bootstrap.ts 强制 DEV_MODE=false → upload 须带合法 Bearer token
JWT_SECRET="gs03-$(date +%s)-$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
export JWT_SECRET
GS_TOKEN="$(node -e '
  const crypto = require("crypto");
  const secret = process.env.JWT_SECRET;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = b64({ sub: "gs03-scenario", role: "admin", orgId: "default", iat: now, exp: now + 3600, jti: "gs03-" + now });
  const sig = crypto.createHmac("sha256", secret).update(header + "." + payload).digest("base64url");
  process.stdout.write(header + "." + payload + "." + sig);
')"
AUTH_HEADER="Authorization: Bearer $GS_TOKEN"
echo "[GS-03] JWT_SECRET 已自举（长度 ${#JWT_SECRET}），token 已签发"

# 1. fresh-db（临时库，测后删除；真实库只读；禁止 cp data/synova.db——铁律 0-4）
DATA_DIR="$(cd "$REPO_ROOT" && npx tsx "$COMMON_DIR/fresh-db.ts")"
echo "[GS-03] 临时数据目录: $DATA_DIR"

# 铁律 0-4 隔离加固（2026-08-21，D462）：config.ts 的 SYNOVA_DB_PATH 优先级高于 SYNOVA_DATA_DIR，
# 开发者会话常自带 SYNOVA_DB_PATH 指向真实库 → 显式覆盖为临时库路径。
export SYNOVA_DB_PATH="$DATA_DIR/synova.db"

cleanup() {
  # 幂等 + 中途失败也清理临时资源（硬契约 8）
  if [[ -f "$DATA_DIR/bootstrap-state.json" ]]; then
    pid="$(python3 -c "import json;print(json.load(open('$DATA_DIR/bootstrap-state.json'))['pid'])" 2>/dev/null || echo "")"
    if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; fi
  fi
  rm -rf "$DATA_DIR" 2>/dev/null || true
  rm -f "$SCRIPT_DIR/expect.runtime.json"
}
trap cleanup EXIT

# 2. bootstrap（临时端口 + healthz 就绪探测）
#   注: bootstrap.ts 起服务后进程不退出（子进程 stdio 管道保持父进程事件循环，2026-08-19 实测）——
#       不能命令替换（会永久挂起），改为后台拉起 + 轮询 bootstrap-state.json
(cd "$REPO_ROOT" && npx tsx "$COMMON_DIR/bootstrap.ts" --data-dir "$DATA_DIR" --timeout 120 \
  > "$DATA_DIR/bootstrap.log" 2>&1 &)
BOOT_STATE="$DATA_DIR/bootstrap-state.json"
BOOT_READY=""
for _ in $(seq 1 60); do
  if [ -f "$BOOT_STATE" ]; then BOOT_READY="yes"; break; fi
  sleep 2
done
if [ -z "$BOOT_READY" ]; then
  echo "[GS-03] ❌ bootstrap 超时（120s 未就绪）— 日志尾:"
  tail -5 "$DATA_DIR/bootstrap.log" 2>/dev/null || true
  exit 2
fi
PORT="$(python3 -c "import json;print(json.load(open('$BOOT_STATE'))['port'])")"
BASE="http://127.0.0.1:$PORT"
echo "[GS-03] 服务就绪: $BASE"

# 3. inject fixture（erp-standard 契约，走 field-mappings）
curl -sS -X POST "$BASE/api/data/upload" \
  -H 'Content-Type: application/json' \
  -H "$AUTH_HEADER" \
  -d "{\"mapping\":\"erp-standard\",\"rows\":[$(cat "$SCRIPT_DIR/fixtures/erp-low-cash.json")],\"graph\":\"default\"}" \
  > "$DATA_DIR/upload-response.json" 2>&1 || true
echo "[GS-03] 注入响应: $(cat "$DATA_DIR/upload-response.json")"

# 4. 触发 cash-runway 哨兵（阈值告警）
curl -sS -X POST "$BASE/api/sentinel/run/cash-runway" \
  > "$DATA_DIR/run-response.json" 2>&1 || true
echo "[GS-03] 触发响应: $(cat "$DATA_DIR/run-response.json")"

# 5. 断言（expect.json 模板 → 注入 DATA_DIR 实际路径）
sed "s|__DATA_DIR__|$DATA_DIR|g" "$SCRIPT_DIR/expect.json" > "$SCRIPT_DIR/expect.runtime.json"

cd "$REPO_ROOT"
set +e
npx tsx "$COMMON_DIR/assert.ts" \
  --expect "$SCRIPT_DIR/expect.runtime.json" \
  --out "$REPO_ROOT/scripts/golden-scenarios/evidence/GS-03-$DATE.json"
ASSERT_EXIT=$?
set -e
echo "[GS-03] 断言 exit: $ASSERT_EXIT"
exit "$ASSERT_EXIT"
