#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# hook-git-detect.test.sh — D312 hook 识别 git 操作测试
#
# 覆盖（铁律 48：正常/降级/边界）:
#   1. stash 命令 → 提示含 baseline-check + 窗口文件 type=stash
#   2. stash pop → 提示含 worktree
#   3. checkout → 输出不含"禁止"文案 + 窗口 type=gitop
#   4. git status / npm test → 无窗口（词边界不误命中）
#   5. 写文件跳过实测: 窗口激活期间 Write → hook-block-write 跳过仓库内写
#   6. --post 清窗 + 畸形输入 fail-open
#   接线断言: hook-git-guard 被 2 个写 hook source
#
# 用法: bash tests/control-tower/hook-git-detect.test.sh
# 退出码: 0 = 全部通过
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DETECT="$REPO_DIR/scripts/hooks/hook-git-detect.sh"
GUARD="$REPO_DIR/scripts/hooks/hook-git-guard.sh"
BLOCK_WRITE="$REPO_DIR/scripts/workflow/hook-block-write.sh"
WINDOW_FILE="$REPO_DIR/.codex/control-tower/tmp/git-op-window.json"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_contains() { # <haystack> <needle> <msg>
  if echo "$1" | grep -qF "$2"; then pass "$3"; else fail "$3 — 未找到: $2"; fi
}
assert_not_contains() {
  if echo "$1" | grep -qF "$2"; then fail "$3 — 不应包含: $2"; else pass "$3"; fi
}

# 清理测试残留
rm -f "$WINDOW_FILE" "$REPO_DIR/.claude/session-locked" 2>/dev/null || true
# D316 P2-1: 中断/失败退出也清窗（否则残留窗口文件 → 下次运行首测失败）
trap 'rm -f "$WINDOW_FILE" "$REPO_DIR/.claude/session-locked" 2>/dev/null || true' EXIT

echo "═══════════════════════════════════════════════════════════"
echo "  D312 hook-git-detect 测试 — hook 识别 git 操作"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── 1. stash 拦截 ──
echo "── 1. stash 命令拦截 ──"
OUT=$(printf '{"tool_input":{"command":"git stash"}}' | bash "$DETECT" 2>&1) || true
assert_contains "$OUT" "baseline-check" "stash 提示含 baseline-check 替代方案"
assert_contains "$OUT" "禁止" "stash 提示含'禁止'文案"
if [ -f "$WINDOW_FILE" ]; then
  WT=$(cat "$WINDOW_FILE" 2>/dev/null | grep -o '"type": *"[^"]*"' | head -1)
  assert_contains "$WT" "stash" "窗口文件 type=stash"
else
  fail "窗口文件未创建"
fi
echo ""

# ── 2. stash pop ──
echo "── 2. stash pop 提示 worktree ──"
rm -f "$WINDOW_FILE"
OUT=$(printf '{"tool_input":{"command":"git stash pop"}}' | bash "$DETECT" 2>&1) || true
assert_contains "$OUT" "worktree" "stash pop 提示含 worktree 替代方案"
echo ""

# ── 3. checkout → gitop（不触发禁止文案）──
echo "── 3. checkout 分类 gitop ──"
rm -f "$WINDOW_FILE"
OUT=$(printf '{"tool_input":{"command":"git checkout src/x.ts"}}' | bash "$DETECT" 2>&1) || true
assert_not_contains "$OUT" "禁止 stash" "checkout 不含 stash 禁止文案"
if [ -f "$WINDOW_FILE" ]; then
  WT=$(cat "$WINDOW_FILE" 2>/dev/null | grep -o '"type": *"[^"]*"' | head -1)
  assert_contains "$WT" "gitop" "窗口文件 type=gitop"
else
  fail "checkout 窗口文件未创建"
fi
echo ""

# ── 4. 词边界不误命中 ──
echo "── 4. git status / npm test 不误命中 ──"
rm -f "$WINDOW_FILE"
printf '{"tool_input":{"command":"git status"}}' | bash "$DETECT" > /dev/null 2>&1 || true
if [ -f "$WINDOW_FILE" ]; then fail "git status 误创建窗口"; else pass "git status 不创建窗口"; fi
printf '{"tool_input":{"command":"npm test"}}' | bash "$DETECT" > /dev/null 2>&1 || true
if [ -f "$WINDOW_FILE" ]; then fail "npm test 误创建窗口"; else pass "npm test 不创建窗口"; fi
echo ""

# ── 5. 写文件跳过实测（核心: stash 窗口期间 Write 不写仓库文件）──
echo "── 5. 写文件跳过实测 ──"
rm -f "$WINDOW_FILE" "$REPO_DIR/.claude/session-locked"
# 激活窗口
printf '{"tool_input":{"command":"git stash"}}' | bash "$DETECT" > /dev/null 2>&1 || true
# 预建假 session-locked（hook-block-write L39 会 rm 它 — 窗口激活时应跳过）
touch "$REPO_DIR/.claude/session-locked"
# 模拟 Write .claude/task-briefs/x.md（hook-block-write 的 brief 分支触发点）
printf '{"tool_input":{"file_path":".claude/task-briefs/x.md"}}' | bash "$BLOCK_WRITE" > /dev/null 2>&1 || true
if [ -f "$REPO_DIR/.claude/session-locked" ]; then
  pass "窗口激活期间 session-locked 未被 rm（写跳过）"
else
  fail "session-locked 被 rm — 写文件未被跳过"
fi
rm -f "$REPO_DIR/.claude/session-locked"
echo ""

# ── 6. --post 清窗 + 畸形输入 fail-open ──
echo "── 6. --post 清窗 + 畸形输入 ──"
if [ -f "$WINDOW_FILE" ]; then
  printf '{"tool_input":{"command":"git stash"}}' | bash "$DETECT" --post > /dev/null 2>&1 || true
  if [ -f "$WINDOW_FILE" ]; then fail "--post 未清窗"; else pass "--post 清窗"; fi
else
  pass "--post 前置窗口已清（跳过）"
fi
rm -f "$WINDOW_FILE"
OUT=$(echo "not-json" | bash "$DETECT" 2>&1) || true
EXIT=$?
if [ "$EXIT" -eq 0 ]; then pass "畸形输入 exit 0（fail-open）"; else fail "畸形输入 exit=$EXIT"; fi

# ── 接线断言: guard 被 2 个写 hook source ──
echo "── 接线断言 ──"
if grep -q "git_op_window_active" "$REPO_DIR/scripts/workflow/hook-block-write.sh" 2>/dev/null; then
  pass "hook-block-write.sh source 了 guard"
else
  fail "hook-block-write.sh 未接 guard"
fi
if grep -q "git_op_window_active" "$REPO_DIR/scripts/hooks/hook-check-memory.sh" 2>/dev/null; then
  pass "hook-check-memory.sh source 了 guard"
else
  fail "hook-check-memory.sh 未接 guard"
fi
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  结果: $PASS 通过, $FAIL 失败"
if [ "$FAIL" -gt 0 ]; then
  echo "  Status: ❌ hook-git-detect 测试未通过"
  echo "═══════════════════════════════════════════════════════════"
  exit 1
fi
echo "  Status: ✅ hook-git-detect 测试全部通过"
echo "═══════════════════════════════════════════════════════════"
exit 0
