#!/bin/bash
# GS-03 资本循环场景 — erp-standard 数据注入 → cash-runway 阈值告警
# 诚实 RED：断言「阈值触发」依赖 D355（cashBalance↔cash 对齐）+ 触发 bug，未落地前如实 RED。
# 运行契约（设计 §2.2 8 条）：fresh-db / bootstrap / inject / trigger / assert / evidence / exit / 幂等。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DATE="$(date +%Y-%m-%d)"

# 1. fresh-db（临时库，测后删除；真实库只读；禁止 cp data/synova.db——铁律 0-4）
DATA_DIR="$(cd "$REPO_ROOT" && npx tsx "$COMMON_DIR/fresh-db.ts")"
echo "[GS-03] 临时数据目录: $DATA_DIR"

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
BOOT_OUT="$(cd "$REPO_ROOT" && npx tsx "$COMMON_DIR/bootstrap.ts" --data-dir "$DATA_DIR" --timeout 120)"
PORT="$(echo "$BOOT_OUT" | python3 -c "import json,sys;print(json.load(sys.stdin)['port'])")"
BASE="http://127.0.0.1:$PORT"
echo "[GS-03] 服务就绪: $BASE"

# 3. inject fixture（erp-standard 契约，走 field-mappings）
curl -sS -X POST "$BASE/api/data/upload" \
  -H 'Content-Type: application/json' \
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
