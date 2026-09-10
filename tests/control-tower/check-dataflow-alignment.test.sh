#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# check-dataflow-alignment.test.sh — D661 关键词提取回归（-oP→-oE，纯字符类）
#
# 覆盖矩阵（铁律 48）:
#   正常 — grep -oE '[a-zA-Z_][a-zA-Z0-9_.]*' 提取标识符关键词
#   回归 — 脚本零 grep -P
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
S="$REPO_DIR/scripts/workflow/check-dataflow-alignment.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "=== D661: check-dataflow-alignment 关键词提取回归 ==="

# 复现脚本 line 27 的提取逻辑（原 grep -oP 换 grep -oE）
DATAFLOW="runModules → computeCashFlowMetrics → EvidencePool"
KEYWORDS=$(echo "$DATAFLOW" | grep -oE '[a-zA-Z_][a-zA-Z0-9_.]*' | sort -u || true)

if echo "$KEYWORDS" | grep -q 'runModules'; then ok "提取 runModules"; else no "未提取 runModules"; fi
if echo "$KEYWORDS" | grep -q 'computeCashFlowMetrics'; then ok "提取 computeCashFlowMetrics"; else no "未提取 computeCashFlowMetrics"; fi
if echo "$KEYWORDS" | grep -q 'EvidencePool'; then ok "提取 EvidencePool"; else no "未提取 EvidencePool"; fi
if grep -qE 'grep[[:space:]]+-[a-zA-Z]*P' "$S"; then no "check-dataflow-alignment.sh 残留 grep -P"; else ok "check-dataflow-alignment.sh 零 grep -P"; fi

echo ""
echo "  结果: $PASS 通过, $FAIL 失败"
if [ "$FAIL" -gt 0 ]; then
  echo "  Status: ❌ check-dataflow-alignment 测试未通过"
  exit 1
fi
echo "  Status: ✅ check-dataflow-alignment 测试全部通过"
exit 0
