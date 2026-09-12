#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# hook-check-task-scope.test.sh — D661 current-brief 日期提取回归（\d → [0-9]）
#
# 覆盖矩阵（铁律 48）:
#   正常 — 提取 YYYY-MM-DD 日期（[0-9]{4}-[0-9]{2}-[0-9]{2}）
#   边界 — 无日期文件名 → 空
#   回归 — 脚本零 grep -P
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
S="$REPO_DIR/scripts/workflow/hook-check-task-scope.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "=== D661: hook-check-task-scope 日期提取回归 ==="

CB="2026-07-14-D83-bootstrap-startup-sequence.md"
# 复现脚本 line 62 的提取（原 grep -oP '\d{4}-\d{2}-\d{2}' 换 grep -oE '[0-9]...'）
CB_DATE=$(echo "$CB" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1 || true)

if [ "$CB_DATE" = "2026-07-14" ]; then ok "提取日期 2026-07-14"; else no "日期提取错误: [$CB_DATE]"; fi

# 边界：无日期文件名 → 空
NO_DATE=$(echo "D83-no-date-brief.md" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1 || true)
if [ -z "$NO_DATE" ]; then ok "无日期文件名返回空"; else no "无日期文件名误提取: [$NO_DATE]"; fi

if grep -qE 'grep[[:space:]]+-[a-zA-Z]*P' "$S"; then no "hook-check-task-scope.sh 残留 grep -P"; else ok "hook-check-task-scope.sh 零 grep -P"; fi

echo ""
echo "  结果: $PASS 通过, $FAIL 失败"
if [ "$FAIL" -gt 0 ]; then
  echo "  Status: ❌ hook-check-task-scope 测试未通过"
  exit 1
fi
echo "  Status: ✅ hook-check-task-scope 测试全部通过"
exit 0
