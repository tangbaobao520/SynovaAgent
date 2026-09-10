#!/usr/bin/env bash
# check-gitlinks.test.sh — D665 密封测试：check-gitlinks.sh 三态守门
#
# 覆盖矩阵：
#   正常  — 干净沙箱仓库（无 gitlink）→ exit 0
#   边界  — 注入 gitlink(160000) 的沙箱仓库 → exit 1，输出点名 160000
#   降级  — 非 git 目录 → exit 2；坏 tree-ish → exit 2（绝不与通过混同，D328）
#   接线  — ci.yml 密封列表含本测试 + .gitignore 覆盖 .synova-wt-* / .sessions/
#
# 密封性（D520 口径）：全部用例在 mktemp 沙箱仓库执行，零真实仓库历史依赖、零网络。

set -u

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
CHECK="$REPO_ROOT/scripts/control-tower/check-gitlinks.sh"
CI_YML="$REPO_ROOT/.github/workflows/ci.yml"
GITIGNORE="$REPO_ROOT/.gitignore"

FAIL=0
say() { printf '%s\n' "$*"; }
assert_eq() { # assert_eq <实际> <期望> <说明>
  if [ "$1" = "$2" ]; then say "  ok: $3"; else say "  FAIL: $3（期望 $2，实际 $1）"; FAIL=1; fi
}

# 密封身份：零系统/全局 git 配置依赖（D663 密封测试同款）
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL=/dev/null
GIT_ID="-c user.email=test@example.com -c user.name=sealed-test"

SANDBOX=$(mktemp -d)
trap 'rm -rf "$SANDBOX"' EXIT

say "== 1. 正常：干净沙箱仓库 → exit 0 =="
CLEAN="$SANDBOX/clean"
git init -q "$CLEAN"
( cd "$CLEAN" && echo a > a.txt && git add a.txt && git $GIT_ID commit -qm clean )
( cd "$CLEAN" && bash "$CHECK" HEAD ); OUT=$?
assert_eq "$OUT" "0" "干净仓库 exit 0"

say "== 2. 边界：注入 gitlink → exit 1 且点名 160000 =="
# 内层仓库提供真实 commit sha（cacheinfo 需合法对象）
SUB="$SANDBOX/sub"
git init -q "$SUB"
( cd "$SUB" && echo s > f.txt && git add f.txt && git $GIT_ID commit -qm sub )
SUBSHA=$(git --git-dir="$SUB/.git" rev-parse HEAD)
POISON="$SANDBOX/poison"
git init -q "$POISON"
( cd "$POISON" \
  && echo b > b.txt && git add b.txt \
  && git update-index --add --cacheinfo "160000,$SUBSHA,runetime-worktree-dir" \
  && git $GIT_ID commit -qm poison )
POISON_OUT=$( cd "$POISON" && bash "$CHECK" HEAD 2>&1 ); POISON_EXIT=$?
assert_eq "$POISON_EXIT" "1" "gitlink 仓库 exit 1"
case "$POISON_OUT" in
  *"160000"*) say "  ok: 输出点名 160000" ;;
  *) say "  FAIL: 输出未点名 160000: $POISON_OUT"; FAIL=1 ;;
esac

say "== 3. 降级：非 git 目录 / 坏 tree-ish → exit 2 =="
( cd "$SANDBOX" && bash "$CHECK" HEAD >/dev/null 2>&1 ); NOGIT=$?
assert_eq "$NOGIT" "2" "非 git 目录 exit 2"
( cd "$CLEAN" && bash "$CHECK" no-such-tree-ish-000 >/dev/null 2>&1 ); BADTREE=$?
assert_eq "$BADTREE" "2" "坏 tree-ish exit 2"

say "== 4. 接线：ci.yml 密封列表 + .gitignore 防再入（铁律 0-2 WIRE CHECK）=="
grep -q "tests/control-tower/check-gitlinks.test.sh" "$CI_YML" \
  && say "  ok: ci.yml 密封列表已入列" \
  || { say "  FAIL: ci.yml 未接线本测试（M3 机制建成未接线）"; FAIL=1; }
grep -qE "^\.synova-wt" "$GITIGNORE" \
  && say "  ok: .gitignore 覆盖 .synova-wt-*" \
  || { say "  FAIL: .gitignore 未覆盖 .synova-wt-*"; FAIL=1; }
grep -qE "^\.sessions/" "$GITIGNORE" \
  && say "  ok: .gitignore 覆盖 .sessions/" \
  || { say "  FAIL: .gitignore 未覆盖 .sessions/"; FAIL=1; }

if [ $FAIL -eq 0 ]; then
  say "[check-gitlinks.test] ALL PASS"
  exit 0
fi
say "[check-gitlinks.test] FAILED"
exit 1
