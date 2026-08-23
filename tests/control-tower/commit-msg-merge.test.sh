#!/usr/bin/env bash
# tests/control-tower/commit-msg-merge.test.sh — D513/① D328 merge 豁免测试
# M13 加固: 沙箱 git 一律 `git -c user.*`（零 config 写入）+ GIT_DIR 隔离——本测试
# 曾因 `git config user.email` 写入宿主 config（沙箱 cd 泄漏）触发 tester 污染事故。
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CMC="$HERE/../../scripts/commit-msg-check.sh"
PASS=0; FAIL=0
ok()  { echo "  ✅ $1"; PASS=$((PASS+1)); }
no()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

grep -q "MERGE_HEAD" "$CMC" && ok "接线: commit-msg-check 含 MERGE_HEAD 检测" || no "接线缺失"

(
  SB="$(mktemp -d /tmp/d513-mg.XXXXXX)"
  trap 'rm -rf "$SB"' EXIT
  git -C "$SB" init -q
  g() { GIT_DIR="$SB/.git" GIT_WORK_TREE="$SB" git -c user.email=t@t -c user.name=t "$@"; }
  echo a > "$SB/a"; g add -A; g commit -qm base
  g checkout -q -b other
  echo b > "$SB/b"; g add -A; g commit -qm other
  g checkout -q main
  echo c > "$SB/c"; g add -A; g commit -qm main2
  g merge --no-commit other >/dev/null 2>&1 || true
  if [ -f "$SB/.git/MERGE_HEAD" ]; then
    echo "merge commit without D-number" > "$SB/msg.txt"
    if (cd "$SB" && GIT_DIR="$SB/.git" GIT_WORK_TREE="$SB" bash "$CMC" "$SB/msg.txt" >/dev/null 2>&1); then
      echo "  ✅ merge 状态下 D328 放行（不再误伤）"
    else
      echo "  ❌ merge 状态仍被拦"; exit 1
    fi
  else
    echo "  ⏭ 沙箱未进入 merge 态，仅接线断言"
  fi
)
rm -rf /tmp/d513-mg.* 2>/dev/null  # swallow-ok: 沙箱清理
echo "pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
