#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# check-test-first.test.sh — D661 export 名提取回归（\K\w+ → grep -oE + awk）
#
# 覆盖矩阵（铁律 48）:
#   正常 — 提取 export function/class 名（\K 仿制：grep -oE 匹配全词 + awk 取尾段）
#   边界 — 不提取 export const（原语义仅 function|class）
#   回归 — 脚本零 grep -P
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
S="$REPO_DIR/scripts/workflow/check-test-first.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "=== D661: check-test-first export 名提取回归 ==="

F=$(mktemp); trap 'rm -f "$F"' EXIT
cat > "$F" <<'EOF'
export function foo() { return 1; }
export class Bar {}
const notExport = 1;
export const baz = 2;
EOF

# 复现脚本 line 29 的提取（原 grep -oP '\K\w+' 换 grep -oE + awk '{print $NF}'）
EXPORTS=$(grep -oE 'export (function|class) [a-zA-Z0-9_]+' "$F" | awk '{print $NF}' || true)

if echo "$EXPORTS" | grep -q 'foo'; then ok "提取 export function foo"; else no "未提取 foo"; fi
if echo "$EXPORTS" | grep -q 'Bar'; then ok "提取 export class Bar"; else no "未提取 Bar"; fi
# check-test-first 仅提取 function|class（不含 const）——原语义
if echo "$EXPORTS" | grep -q 'baz'; then no "不应提取 const baz（原语义仅 function|class）"; else ok "const 不提取（原语义）"; fi
if grep -qE 'grep[[:space:]]+-[a-zA-Z]*P' "$S"; then no "check-test-first.sh 残留 grep -P"; else ok "check-test-first.sh 零 grep -P"; fi

echo ""
echo "  结果: $PASS 通过, $FAIL 失败"
if [ "$FAIL" -gt 0 ]; then
  echo "  Status: ❌ check-test-first 测试未通过"
  exit 1
fi
echo "  Status: ✅ check-test-first 测试全部通过"
exit 0
