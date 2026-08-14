#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# hooks-install.test.sh — D318 双机 hooks 可移植测试
#
# 覆盖（铁律 48：正常/降级/边界）:
#   1. install-hooks 装全 4 hook（修复前只装 post-commit → pre-commit 缺失 = red）
#   2. 4 包装器无绝对路径硬编码（修复前 post-commit 含 D:/ = red）
#   3. verify-hooks-installed exit 0（修复前脚本不存在 = red）
#   4. configure-machine --role mac 设身份（修复前未实现 = red）
#   5. 临时克隆 git commit 触发 pre-commit 且 12 组全过（不 --no-verify；DS7）
#
# 隔离: mktemp -d + git clone -q file://<repo>（本地克隆，不依赖网络）。
# 新克隆 .git/hooks 只有 sample 文件 → 完整模拟双机第二台机器。
#
# 用法: bash tests/control-tower/hooks-install.test.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_exit() { if [ "$1" = "$2" ]; then pass "$3 (exit=$2)"; else fail "$3 — 期望 exit=$1 实际=$2"; fi; }
assert_contains() { if echo "$1" | grep -qF "$2"; then pass "$3"; else fail "$3 — 未找到: $2"; fi; }

TMP_ROOT=$(mktemp -d)
trap 'rm -rf "$TMP_ROOT" 2>/dev/null || true' EXIT
CLONE="$TMP_ROOT/clone"

echo "═══════════════════════════════════════════════════════════"
echo "  D318 hooks-install 测试 — 双机 hooks 可移植"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "── 准备: 临时克隆 (file:// 本地克隆, 无 .git/hooks = 新机器模拟)"
if ! git clone -q "file://$REPO_DIR" "$CLONE"; then
  fail "临时克隆失败 — 测试无法进行"
  echo "═══════════════════════════════════════════════════════════"
  exit 1
fi
HOOKS="$CLONE/.git/hooks"
if ls "$HOOKS" | grep -qv sample; then
  fail "临时克隆不应自带 hooks — 模拟失实"
else
  pass "临时克隆 hooks 目录为空（新机器模拟）"
fi
echo ""

# ── 1. install-hooks 装全 4 hook ──
echo "── 1. install-hooks 4 hook 全覆盖 ──"
OUT=$(cd "$CLONE" && bash "$REPO_DIR/scripts/install-hooks.sh" 2>&1) || {
  fail "install-hooks 失败: $OUT"
  FAIL=$((FAIL - 0)); PASS=$PASS
}
for h in pre-commit commit-msg pre-push post-commit; do
  if [ -f "$HOOKS/$h" ] && [ -x "$HOOKS/$h" ]; then
    pass "hook $h 存在且可执行"
  else
    fail "hook $h 缺失或不可执行（install-hooks 未覆盖）"
  fi
done
echo ""

# ── 2. 包装器无绝对路径硬编码 ──
# 判据: bash " 后跟 $ = 运行时求值（$(git rev-parse) 或 $ROOT 变量，可移植）；
#       跟字面字符 = 硬编码绝对路径（D:/ /tmp/ /Users/ C:\ 全部形式，跨机失效）
echo "── 2. 包装器无绝对路径硬编码（bash \" 后跟字面路径）──"
BAD=$(grep -HE 'bash "[^$]' \
  "$HOOKS/pre-commit" "$HOOKS/commit-msg" "$HOOKS/pre-push" "$HOOKS/post-commit" 2>/dev/null || true)
if [ -z "$BAD" ]; then
  pass "4 包装器全部 toplevel-relative（无硬编码绝对路径）"
else
  fail "发现硬编码绝对路径: $BAD"
fi
echo ""

# ── 3. verify-hooks-installed exit 0 ──
echo "── 3. verify-hooks-installed 自检 ──"
EXIT=0
VOUT=$(cd "$CLONE" && bash "$REPO_DIR/scripts/setup/verify-hooks-installed.sh" 2>&1) || EXIT=$?
assert_exit 0 "$EXIT" "verify-hooks-installed exit 0"
echo ""

# ── 4. configure-machine --role mac 设身份 ──
echo "── 4. configure-machine --role mac 双机身份 ──"
EXIT=0
COUT=$(cd "$CLONE" && bash "$REPO_DIR/scripts/setup/configure-machine.sh" --role mac 2>&1) || EXIT=$?
assert_exit 0 "$EXIT" "configure-machine --role mac exit 0"
NAME=$(cd "$CLONE" && git config user.name)
assert_contains "$NAME" "Synova-Mac" "user.name = Synova-Mac（机器归属靠 name）"
EMAIL=$(cd "$CLONE" && git config user.email)
assert_contains "$EMAIL" "synova@users.noreply.github.com" "user.email 保持同一账号 noreply"
echo ""

# ── 5. commit 触发 pre-commit（不 --no-verify；DS7）──
echo "── 5. 干净克隆 commit 触发 pre-commit 12 组 ──"
EXIT=0
COUT=$(cd "$CLONE" && git commit --allow-empty -m "chore(D318): hook-install-test" 2>&1) || EXIT=$?
assert_exit 0 "$EXIT" "commit 成功"
assert_contains "$COUT" "全部 12 组通过" "pre-commit 12 组真实执行且全过"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  结果: $PASS 通过, $FAIL 失败"
if [ "$FAIL" -gt 0 ]; then
  echo "  Status: ❌ hooks-install 测试未通过"
  echo "═══════════════════════════════════════════════════════════"
  exit 1
fi
echo "  Status: ✅ hooks-install 测试全部通过"
echo "═══════════════════════════════════════════════════════════"
exit 0
