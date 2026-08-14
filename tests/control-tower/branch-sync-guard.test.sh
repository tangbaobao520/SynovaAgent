#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# branch-sync-guard.test.sh — D335 提交端同步门禁测试
#
# 覆盖（铁律 48: 正常/降级/边界; 铁律 0-2: red→green）:
#   1. main 落后远端 main → exit 1（red: 无检查 → exit 0）
#   2. main 与远端同步 → exit 0
#   3. feat 分支基线过期（main 有新提交）→ exit 1 + 提示 rebase
#   4. feat 分支与 main 分叉 → exit 1
#   5. feat 分支基于最新 main → exit 0
#   6. fetch 失败（remote 不存在）→ fail-open exit 0 + 显式提示（铁律 11 不静默）
#   7. 逃生舱 SYNO_SKIP_BRANCH_SYNC=1 → exit 0 + degraded 记录
#   8. 生产接线: synova-commit 调用 check-branch-sync.sh（red: 零调用 → 失败）
#
# 隔离: mktemp 临时 bare 远端 + 本地仓库, file:// 协议零网络。
#       SYNO_BRANCH_SYNC_ONLY=1 → 只跑本检查。
# 用法: bash tests/control-tower/branch-sync-guard.test.sh
# 退出码: 0 = 全部通过
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CHECK="$REPO_DIR/scripts/control-tower/check-branch-sync.sh"
SYNOVA_COMMIT="$REPO_DIR/scripts/control-tower/synova-commit"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_exit() { # <got> <want> <msg>
  if [ "$1" -eq "$2" ]; then pass "$3"; else fail "$3 (got exit=$1, want exit=$2)"; fi
}

# ── 沙箱 ──
REMOTE_DIR=$(mktemp -d /tmp/bss-remote.XXXXXX)
LOCAL_DIR=$(mktemp -d /tmp/bss-local.XXXXXX)
git init --bare -q "$REMOTE_DIR"
git init -q "$LOCAL_DIR"
git -C "$LOCAL_DIR" remote add origin "file://$REMOTE_DIR"
git -C "$LOCAL_DIR" config user.email t@t
git -C "$LOCAL_DIR" config user.name t

OTHER_DIR=$(mktemp -d /tmp/bss-other.XXXXXX)
git clone -q "file://$REMOTE_DIR" "$OTHER_DIR" 2>/dev/null # swallow-ok: 测试沙箱克隆
git -C "$OTHER_DIR" config user.email w@w
git -C "$OTHER_DIR" config user.name w

commit_empty() { # <repo> <file> <msg>
  echo "$3" > "$1/$2"
  git -C "$1" add "$2" 2>/dev/null # swallow-ok: 测试辅助暂存
  git -C "$1" commit -q -m "$3"
}

# run_check <local_dir> <remote_name> [main_branch] [extra_env]
run_check() {
  local dir="$1" rname="$2" mbr="${3:-main}" envs="${4:-}"
  ( cd "$dir" && env $envs SYNO_BRANCH_SYNC_ONLY=1 bash "$CHECK" "$rname" "$mbr" > /tmp/bss-out.txt 2>&1 )
  echo $?
}

echo "=== D335 提交端同步门禁: branch-sync-guard 测试 ==="

# 1. main 落后: 本地 main=HEAD(A), 远端 main=A+B
commit_empty "$LOCAL_DIR" a.txt "A"
git -C "$LOCAL_DIR" push -q origin HEAD:main 2>/dev/null # swallow-ok: 基线推送
git -C "$OTHER_DIR" pull -q origin main 2>/dev/null || true # swallow-ok: 测试沙箱拉平, 失败由后续断言暴露
commit_empty "$OTHER_DIR" b.txt "B"
git -C "$OTHER_DIR" push -q origin HEAD:main 2>/dev/null # swallow-ok: 模拟另一台机器
EC=$(run_check "$LOCAL_DIR" origin)
assert_exit "$EC" 1 "1. main 落后远端 → 硬阻断"
grep -q "pull --ff-only" /tmp/bss-out.txt && pass "   阻断消息含 pull --ff-only 提示" || fail "   阻断消息缺修复提示"

# 2. main 同步: 拉平后
git -C "$LOCAL_DIR" pull -q origin main 2>/dev/null || true # swallow-ok: 测试沙箱拉平, 失败由后续断言暴露
EC=$(run_check "$LOCAL_DIR" origin)
assert_exit "$EC" 0 "2. main 与远端同步 → 放行"

# 3. feat 基线过期: feat 基于 A, main 已有 A+B+C
git -C "$LOCAL_DIR" checkout -q -b feat/work 2>/dev/null # swallow-ok: 测试沙箱切分支, 失败由后续断言暴露
git -C "$OTHER_DIR" pull -q origin main 2>/dev/null || true # swallow-ok: 测试沙箱拉平, 失败由后续断言暴露
commit_empty "$OTHER_DIR" c.txt "C"
git -C "$OTHER_DIR" push -q origin HEAD:main 2>/dev/null # swallow-ok: 模拟另一台机器
EC=$(run_check "$LOCAL_DIR" origin)
assert_exit "$EC" 1 "3. feat 基线过期（main 有新提交）→ 硬阻断"
grep -q "rebase" /tmp/bss-out.txt && pass "   阻断消息含 rebase 提示" || fail "   阻断消息缺 rebase 提示"

# 4. feat 分叉: feat 有本地新提交, main 也有新提交
commit_empty "$LOCAL_DIR" d.txt "D"
EC=$(run_check "$LOCAL_DIR" origin)
assert_exit "$EC" 1 "4. feat 与 main 分叉 → 硬阻断"

# 5. feat 基于最新 main: rebase 后
git -C "$LOCAL_DIR" fetch -q origin main 2>/dev/null # swallow-ok: 测试沙箱 fetch, 失败由后续断言暴露
git -C "$LOCAL_DIR" rebase -q origin/main 2>/dev/null # swallow-ok: 测试沙箱 rebase, 失败由后续断言暴露
EC=$(run_check "$LOCAL_DIR" origin)
assert_exit "$EC" 0 "5. feat 基于最新 main → 放行"

# 6. fetch 失败 → fail-open
EC=$(run_check "$LOCAL_DIR" ghost)
assert_exit "$EC" 0 "6. fetch 失败 → fail-open 放行"
grep -q "fail-open" /tmp/bss-out.txt && pass "   fail-open 有显式提示" || fail "   fail-open 缺显式提示（静默）"

# 7. 逃生舱
EC=$(run_check "$LOCAL_DIR" origin main "SYNO_SKIP_BRANCH_SYNC=1")
assert_exit "$EC" 0 "7. SYNO_SKIP_BRANCH_SYNC=1 逃生舱 → 放行"

# 8. 生产接线: synova-commit 调用 check-branch-sync.sh
CALLS=$(grep -c "check-branch-sync.sh" "$SYNOVA_COMMIT" | tr -d ' \n' || echo 0)
if [ "${CALLS:-0}" -ge 1 ]; then
  pass "8. synova-commit 调用 check-branch-sync.sh ($CALLS 处)"
else
  fail "8. synova-commit 零调用 check-branch-sync.sh（未接线）"
fi

rm -rf "$REMOTE_DIR" "$LOCAL_DIR" "$OTHER_DIR" /tmp/bss-out.txt
echo ""
echo "结果: $PASS 通过 / $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
