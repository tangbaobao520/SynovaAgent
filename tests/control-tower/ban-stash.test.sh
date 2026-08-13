#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# ban-stash.test.sh — D312 禁 stash 铁律测试
#
# 覆盖（铁律 48：正常/降级/边界）:
#   1. git stash → 提示含 baseline-check（替代方案指引）
#   2. git stash pop → 提示含 worktree
#   3. git checkout → 提示不含"禁止 stash"文案（gitop 与 stash 区分）
#   4. git stash list → 不触发（只读例外，护住 pre-doc-audit.sh）
#   5. guard 单元: source hook-git-guard.sh → active=false → enter → true → exit → false
#
# 用法: bash tests/control-tower/ban-stash.test.sh
# 退出码: 0 = 全部通过
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DETECT="$REPO_DIR/scripts/hooks/hook-git-detect.sh"
GUARD="$REPO_DIR/scripts/hooks/hook-git-guard.sh"
WINDOW_FILE="$REPO_DIR/.codex/control-tower/tmp/git-op-window.json"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_contains() {
  if echo "$1" | grep -qF "$2"; then pass "$3"; else fail "$3 — 未找到: $2"; fi
}
assert_not_contains() {
  if echo "$1" | grep -qF "$2"; then fail "$3 — 不应包含: $2"; else pass "$3"; fi
}

rm -f "$WINDOW_FILE" 2>/dev/null || true

echo "═══════════════════════════════════════════════════════════"
echo "  D312 ban-stash 测试 — 禁 stash 铁律"
echo "═══════════════════════════════════════════════════════════"
echo ""

echo "── 1. git stash → baseline-check 指引 ──"
OUT=$(printf '{"tool_input":{"command":"git stash"}}' | bash "$DETECT" 2>&1) || true
assert_contains "$OUT" "baseline-check" "stash 提示含 baseline-check"
echo ""

echo "── 2. git stash pop → worktree 指引 ──"
rm -f "$WINDOW_FILE"
OUT=$(printf '{"tool_input":{"command":"git stash pop"}}' | bash "$DETECT" 2>&1) || true
assert_contains "$OUT" "worktree" "stash pop 提示含 worktree"
echo ""

echo "── 3. git checkout 不含 stash 禁止文案 ──"
rm -f "$WINDOW_FILE"
OUT=$(printf '{"tool_input":{"command":"git checkout src/x.ts"}}' | bash "$DETECT" 2>&1) || true
assert_not_contains "$OUT" "禁止 stash" "checkout 不含 stash 禁止文案"
echo ""

echo "── 4. git stash list 只读例外 ──"
rm -f "$WINDOW_FILE"
OUT=$(printf '{"tool_input":{"command":"git stash list"}}' | bash "$DETECT" 2>&1) || true
assert_not_contains "$OUT" "禁止" "stash list 不触发禁止提示"
if [ -f "$WINDOW_FILE" ]; then fail "stash list 误创建窗口"; else pass "stash list 不创建窗口"; fi
echo ""

echo "── 5. guard 单元测试 ──"
rm -f "$WINDOW_FILE"
if [ -f "$GUARD" ]; then
  # 子 shell 内 source guard 测状态机
  RESULT=$(bash -c "
source '$GUARD' 2>/dev/null || exit 9
git_op_exit 2>/dev/null || true
A1=\$(git_op_window_active; echo \$?)
git_op_enter stash 'test-cmd' 2>/dev/null || true
A2=\$(git_op_window_active; echo \$?)
git_op_exit 2>/dev/null || true
A3=\$(git_op_window_active; echo \$?)
echo \"\$A1 \$A2 \$A3\"
" 2>/dev/null || echo "9 9 9")
  if [ "$RESULT" = "1 0 1" ]; then
    pass "guard 状态机: inactive→enter→active→exit→inactive"
  else
    fail "guard 状态机异常: $RESULT (期望 '1 0 1')"
  fi
else
  fail "hook-git-guard.sh 不存在"
fi
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  结果: $PASS 通过, $FAIL 失败"
if [ "$FAIL" -gt 0 ]; then
  echo "  Status: ❌ ban-stash 测试未通过"
  echo "═══════════════════════════════════════════════════════════"
  exit 1
fi
echo "  Status: ✅ ban-stash 测试全部通过"
echo "═══════════════════════════════════════════════════════════"
exit 0
