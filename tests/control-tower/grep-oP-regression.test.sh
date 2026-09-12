#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# grep-oP-regression.test.sh — D661 grep -P 家族回归网
#
# 覆盖矩阵（铁律 48）:
#   正常 — scripts/workflow/ + scripts/control-tower/ 内 grep -P（含 -oP/-qP/-rohP）零命中
#   边界 — 只扫 .sh 脚本（PLATFORM-CHECKLIST.md 记录 grep -P 现象，属文档非代码，排除）
#
# 防家族复发: D421(post-commit.sh)/D660(resolve-commit-brief.sh)/D661 三次同型
# （BSD grep 无 -P → 检查静默失效）。本测试是物理回归网——任何新增 grep -P 立即红。
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "=== D661: grep -P 家族回归网 ==="

# 回归网: 两个目录内 .sh 文件不得出现任何 grep -P 变体（-P/-oP/-qP/-rohP/-ohP）。
# 匹配 "-" 后字母序列含 "P" 的 flag（-oP/-qP/-rohP/-P），不误伤 -E/-rnE/-oE/-qE。
HITS=$(grep -rnE 'grep[[:space:]]+-[a-zA-Z]*P' "$REPO/scripts/workflow/" "$REPO/scripts/control-tower/" --include='*.sh' 2>/dev/null || true)
if [ -z "$HITS" ]; then
  ok "scripts/workflow/ + scripts/control-tower/ 内 grep -P 零命中"
else
  no "残留 grep -P 用法（BSD grep 无 -P，检查会静默失效）："
  echo "$HITS" | sed 's/^/      /' >&2
fi

echo ""
echo "  结果: $PASS 通过, $FAIL 失败"
if [ "$FAIL" -gt 0 ]; then
  echo "  Status: ❌ grep -P 回归网未通过"
  exit 1
fi
echo "  Status: ✅ grep -P 回归网全部通过"
exit 0
