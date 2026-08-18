#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# push-sync-guard.test.sh — D334 门禁 0 多机同步检查测试
#
# 覆盖（铁律 48: 正常/降级/边界; 铁律 0-2: red→green）:
#   1. main 直接 push → exit 1（red: 无检查 → exit 0）
#   2. main + SYNO_ALLOW_MAIN_PUSH=1 逃生舱 → exit 0
#   3. 本地落后远端（远端有新 commit）→ exit 1 + 提示 pull
#   4. 本地与远端分叉（双向新 commit）→ exit 1 + 提示 rebase
#   5. 本地领先/与远端同步 → exit 0
#   6. fetch 失败（remote 不存在）→ fail-open exit 0 + 显式提示（铁律 11 不静默）
#   7. 无 refs 输入（非 hook 环境调用）→ fail-open exit 0 + 显式提示
#   8. 生产接线: install-hooks.sh 的 pre-push entry 含 "$1"（D334 传 remote 参数，
#      旧格式零参数会让门禁 0 拿不到 remote → 退化）(red: 无 → 断言失败)
#   9. 生产接线: pre-push-check.sh 主流程调用 check_push_sync（red: 零调用 → 失败）
#   10. 删除操作 (git push --delete, local_sha 全零) → 跳过同步检查 exit 0（D457）
#
# 隔离: mktemp 临时 bare 远端 + 本地仓库, file:// 协议零网络。
#       SYNO_SYNC_ONLY=1 → 只跑门禁 0, 不触及其他门禁。
# 用法: bash tests/control-tower/push-sync-guard.test.sh
# 退出码: 0 = 全部通过
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PRE_PUSH="$REPO_DIR/scripts/pre-push-check.sh"
INSTALL_HOOKS="$REPO_DIR/scripts/install-hooks.sh"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_exit() { # <got> <want> <msg>
  if [ "$1" -eq "$2" ]; then pass "$3"; else fail "$3 (got exit=$1, want exit=$2)"; fi
}

# ── 测试沙箱: 本地仓库 + bare 远端 ──
REMOTE_DIR=$(mktemp -d /tmp/pss-remote.XXXXXX)
LOCAL_DIR=$(mktemp -d /tmp/pss-local.XXXXXX)
git init --bare -q "$REMOTE_DIR"
git init -q "$LOCAL_DIR"
git -C "$LOCAL_DIR" remote add origin "file://$REMOTE_DIR"
git -C "$LOCAL_DIR" config user.email t@t
git -C "$LOCAL_DIR" config user.name t

# 用第二个 clone 模拟"另一台机器"向远端推提交
OTHER_DIR=$(mktemp -d /tmp/pss-other.XXXXXX)
git clone -q "file://$REMOTE_DIR" "$OTHER_DIR" 2>/dev/null # swallow-ok: 测试沙箱克隆, 失败由后续断言暴露
git -C "$OTHER_DIR" config user.email w@w
git -C "$OTHER_DIR" config user.name w

# helper: 在指定仓库做一个空提交
commit_empty() { # <repo> <file> <msg>
  local r="$1" f="$2" m="$3"
  echo "$m" > "$r/$f"
  git -C "$r" add "$f" 2>/dev/null # swallow-ok: 测试辅助暂存, 失败由后续断言暴露
  git -C "$r" commit -q -m "$m"
}

# helper: 以 hook 方式调用门禁 0
# run_sync <local_dir> <remote_name> <remote_url> <branch_ref> <extra_env>
run_sync() {
  local dir="$1" rname="$2" rurl="$3" bref="$4" envs="$5"
  local sha
  sha=$(git -C "$dir" rev-parse HEAD)
  ( cd "$dir" && \
    printf '%s %s %s %s\n' "$bref" "$sha" "$bref" "$sha" | \
    env $envs SYNO_SYNC_ONLY=1 bash "$PRE_PUSH" "$rname" "$rurl" > /tmp/pss-out.txt 2>&1 )
  echo $?
}

echo "=== D334 门禁 0: push-sync-guard 测试 ==="

# 1. main 直接 push → 阻断
commit_empty "$LOCAL_DIR" a.txt "A"
EC=$(run_sync "$LOCAL_DIR" origin "file://$REMOTE_DIR" "refs/heads/main" "")
assert_exit "$EC" 1 "1. main 直推 → 硬阻断"
grep -q "0-2" /tmp/pss-out.txt && pass "   阻断消息含门禁 0-2" || fail "   阻断消息缺门禁 0-2 标识"

# 2. main + 逃生舱 → 放行（fetch 会成功: 远端空 → 同步放行）
EC=$(run_sync "$LOCAL_DIR" origin "file://$REMOTE_DIR" "refs/heads/main" "SYNO_ALLOW_MAIN_PUSH=1")
assert_exit "$EC" 0 "2. main + SYNO_ALLOW_MAIN_PUSH=1 逃生舱 → 放行"

# 准备基线: 本地推送 A 到远端 feat/test 分支
git -C "$LOCAL_DIR" push -q origin HEAD:feat/test 2>/dev/null # swallow-ok: 基线推送, 失败由后续断言暴露

# 3. 落后: 另一台机器推 B, 本地只有 A
git -C "$OTHER_DIR" pull -q origin feat/test 2>/dev/null || git -C "$OTHER_DIR" fetch -q origin feat/test 2>/dev/null || true
git -C "$OTHER_DIR" checkout -q feat/test 2>/dev/null || git -C "$OTHER_DIR" checkout -q -b feat/test origin/feat/test 2>/dev/null || true
commit_empty "$OTHER_DIR" b.txt "B"
git -C "$OTHER_DIR" push -q origin HEAD:feat/test 2>/dev/null # swallow-ok: 模拟另一台机器推送, 失败由后续断言暴露
EC=$(run_sync "$LOCAL_DIR" origin "file://$REMOTE_DIR" "refs/heads/feat/test" "")
assert_exit "$EC" 1 "3. 本地落后远端 → 硬阻断"
grep -q "0-1" /tmp/pss-out.txt && pass "   阻断消息含门禁 0-1" || fail "   阻断消息缺门禁 0-1 标识"

# 4. 分叉: 本地基于 A 提交 C, 远端已有 B (基于 A)
commit_empty "$LOCAL_DIR" c.txt "C"
EC=$(run_sync "$LOCAL_DIR" origin "file://$REMOTE_DIR" "refs/heads/feat/test" "")
assert_exit "$EC" 1 "4. 本地与远端分叉 → 硬阻断"
grep -q "分叉" /tmp/pss-out.txt && pass "   阻断消息含分叉提示" || fail "   阻断消息缺分叉提示"

# 5. 同步: 本地领先（远端=本地历史的前缀）— force push 到测试 bare 远端
#    （模拟真实场景: 本地 push 成功后远端=本地）
git -C "$LOCAL_DIR" push -q --force origin HEAD:feat/test 2>/dev/null # swallow-ok: 测试 bare 远端强制同步, 失败由后续断言暴露
EC=$(run_sync "$LOCAL_DIR" origin "file://$REMOTE_DIR" "refs/heads/feat/test" "")
assert_exit "$EC" 0 "5. 本地与远端同步 → 放行"

# 6. fetch 失败（remote 不存在）→ fail-open 显式提示
commit_empty "$LOCAL_DIR" d.txt "D"
EC=$(run_sync "$LOCAL_DIR" ghost "file:///nonexistent-xyz" "refs/heads/feat/test" "")
assert_exit "$EC" 0 "6. fetch 失败 → fail-open 放行"
grep -q "fail-open" /tmp/pss-out.txt && pass "   fail-open 有显式提示（不静默）" || fail "   fail-open 缺显式提示（静默降级）"

# 7. 无 refs 输入（非 hook 调用）→ fail-open
EC=$( ( cd "$LOCAL_DIR" && SYNO_SYNC_ONLY=1 bash "$PRE_PUSH" origin "file://$REMOTE_DIR" < /dev/null > /tmp/pss-out7.txt 2>&1; echo $? ) )
assert_exit "$EC" 0 "7. 无 refs 输入 → fail-open 放行"

# 8. 生产接线: install-hooks.sh pre-push entry 传 "$1"（remote 参数）
if grep -q 'pre-push-check.sh" "\$1" "\$2"' "$INSTALL_HOOKS"; then
  pass "8. install-hooks.sh pre-push entry 传 remote 参数 (\$1 \$2)"
else
  fail "8. install-hooks.sh pre-push entry 未传 remote 参数（门禁 0 拿不到 remote → 退化）"
fi

# 9. 生产接线: pre-push-check.sh 主流程调用 check_push_sync
SYNC_CALLS=$(grep -c "check_push_sync \"\$PUSH_REMOTE\"" "$PRE_PUSH" | tr -d ' \n' || echo 0)
if [ "${SYNC_CALLS:-0}" -ge 1 ]; then
  pass "9. pre-push-check.sh 主流程调用 check_push_sync ($SYNC_CALLS 处)"
else
  fail "9. pre-push-check.sh 主流程零调用 check_push_sync（未接线）"
fi

# 10. 删除操作 (local_sha 全零) → 跳过同步检查 exit 0（D457）
ZERO_SHA="0000000000000000000000000000000000000000"
EC=$( ( cd "$LOCAL_DIR" && \
  printf '%s %s %s %s\n' "refs/heads/feat/test" "$ZERO_SHA" "refs/heads/feat/test" "$(git rev-parse HEAD)" | \
  SYNO_SYNC_ONLY=1 bash "$PRE_PUSH" origin "file://$REMOTE_DIR" > /tmp/pss-out10.txt 2>&1; echo $? ) )
assert_exit "$EC" 0 "10. 删除操作 (local_sha 全零) → 跳过同步检查 exit 0"
grep -q "删除操作" /tmp/pss-out10.txt && pass "   删除操作有跳过提示（不静默）" || fail "   删除操作缺跳过提示"

# 清理
rm -rf "$REMOTE_DIR" "$LOCAL_DIR" "$OTHER_DIR" /tmp/pss-out*.txt

echo ""
echo "结果: $PASS 通过 / $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
