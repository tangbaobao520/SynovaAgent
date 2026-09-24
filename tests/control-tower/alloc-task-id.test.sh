#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# alloc-task-id.test.sh — D384/CT-36 D# 统一分配器测试
#
# 覆盖 (铁律 48: 正常/降级/边界):
#   1. 正常分配 → 输出 D# + 建空壳 (status=claimed)
#   2. 连续分配 → 单调递增 (不重复发号)
#   3. dry-run → 只预览不建壳
#   4. 空任务名 → exit 1 + 用法提示
#   5. 撞车防护 → 目标号已存在时报错 (fail-closed)
#
# 零真实仓库污染: 用临时 task-state 目录 (SYNO_TASK_STATE_DIR 注入缝)。
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TOOL="$REPO_DIR/scripts/control-tower/alloc-task-id.sh"
TMP_DIR="/tmp/d384-alloc-tests"

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_contains() { if echo "$1" | grep -qF "$2"; then pass "$3"; else fail "$3 — 未找到: $2"; fi; }
assert_exit() { if [ "$1" = "$2" ]; then pass "$3 (exit=$2)"; else fail "$3 — 期望 exit=$1 实际=$2"; fi; }
# D940 判别性夹具辅助: 「必须拒绝」与「不得出现某标记」
assert_ne0() { if [ "$1" != "0" ]; then pass "$2 (exit=$1)"; else fail "$2 — 期望 exit≠0，实际 0（fail-closed 未生效）"; fi; }
assert_lacks() { if echo "$1" | grep -qF "$2"; then fail "$3 — 不应出现: $2"; else pass "$3"; fi; }

mkdir -p "$TMP_DIR"
rm -rf "$TMP_DIR/task-state" 2>/dev/null || true
mkdir -p "$TMP_DIR/task-state"
# 注入缝: 复制 TEMPLATE + 预置占用号 D499 模拟已有任务（D500 起步边界：max=499 → +1=500）
cp "$REPO_DIR/task-state/TEMPLATE.json" "$TMP_DIR/task-state/TEMPLATE.json"
cat > "$TMP_DIR/task-state/D499.json" <<'EOF'
{"task_id":"D499","status":"claimed","spec":null,"impl":null,"audit":null}
EOF

echo "═══════════════════════════════════════════════════════════"
echo "  D384 alloc-task-id 分配器测试"
echo "═══════════════════════════════════════════════════════════"
echo ""

echo "── 1. 正常分配 → D500 + 建壳 ──"
OUT=$(SYNO_TASK_STATE_DIR="$TMP_DIR/task-state" SYNO_BRIEF_DIR="$TMP_DIR/task-briefs" SYNO_ALLOC_NO_REMOTE=1 bash "$TOOL" "测试任务A" 2>&1)
assert_contains "$OUT" "D500" "分配 D500 (max=499 → +1=500 起步)"
assert_contains "$OUT" "已登记" "登记提示"
if [ -f "$TMP_DIR/task-state/D500.json" ]; then pass "空壳已建"; else fail "空壳未建"; fi
if grep -q '"status": "claimed"' "$TMP_DIR/task-state/D500.json"; then pass "status=claimed"; else fail "status 非 claimed"; fi
echo ""

echo "── 2. 连续分配 → D501 (单调递增) ──"
OUT=$(SYNO_TASK_STATE_DIR="$TMP_DIR/task-state" SYNO_BRIEF_DIR="$TMP_DIR/task-briefs" SYNO_ALLOC_NO_REMOTE=1 bash "$TOOL" "测试任务B" 2>&1)
assert_contains "$OUT" "D501" "第二次分配 D501"
echo ""

echo "── 3. dry-run → 只预览不建壳 ──"
OUT=$(SYNO_TASK_STATE_DIR="$TMP_DIR/task-state" SYNO_BRIEF_DIR="$TMP_DIR/task-briefs" SYNO_ALLOC_NO_REMOTE=1 bash "$TOOL" "预览任务" --dry-run 2>&1)
assert_contains "$OUT" "D502" "dry-run 预览 D502"
assert_contains "$OUT" "dry-run" "dry-run 标注"
if [ ! -f "$TMP_DIR/task-state/D502.json" ]; then pass "dry-run 未建壳"; else fail "dry-run 竟建壳了"; fi
echo ""

echo "── 4. 空任务名 → exit 1 + 用法 ──"
EXIT=0
OUT=$(SYNO_TASK_STATE_DIR="$TMP_DIR/task-state" SYNO_BRIEF_DIR="$TMP_DIR/task-briefs" SYNO_ALLOC_NO_REMOTE=1 bash "$TOOL" 2>&1) || EXIT=$?
assert_exit 1 "$EXIT" "空名拒绝"
assert_contains "$OUT" "用法" "用法提示"
echo ""

echo "── 5. 撞车防护逻辑存在（并发竞态防御；单进程不可触发，靠唯一入口 + 建壳原子检查）──"
# NEXT=MAX+1 天然不撞；并发窗口（两进程同算 NEXT）靠「建壳前 -f 检查」拒绝。
# 单测验证防护代码存在 + 正常流程不误触发。
if grep -q '已存在\|STATE_FILE' "$TOOL"; then pass "防护逻辑存在 (建壳前检查)"; else fail "防护逻辑缺失"; fi
EXIT=0
OUT=$(SYNO_TASK_STATE_DIR="$TMP_DIR/task-state" SYNO_BRIEF_DIR="$TMP_DIR/task-briefs" SYNO_ALLOC_NO_REMOTE=1 bash "$TOOL" "正常任务" 2>&1) || EXIT=$?
assert_exit 0 "$EXIT" "正常流程不误触发 (exit 0)"
echo ""

echo "── 6. D550: origin/main 占用合并（落后本地不漏号——D547/D548 撞号实证）──"
MAIN_MAX=$(git ls-tree --name-only origin/main task-state/ 2>/dev/null | grep -oE 'D[0-9]+\.json' | sed 's/D\([0-9]*\)\.json/\1/' | sort -n | tail -1)
rm -rf "$TMP_DIR/ts-empty"; mkdir -p "$TMP_DIR/ts-empty"
cp "$REPO_DIR/task-state/TEMPLATE.json" "$TMP_DIR/ts-empty/TEMPLATE.json"
OUT=$(SYNO_TASK_STATE_DIR="$TMP_DIR/ts-empty" SYNO_BRIEF_DIR="$TMP_DIR/task-briefs" bash "$TOOL" "空目录测试" 2>&1)
GOT=$(echo "$OUT" | grep -oE 'D[0-9]+' | head -1 | sed 's/D//')
if [ -n "$MAIN_MAX" ] && [ -n "$GOT" ] && [ "$GOT" -gt "$MAIN_MAX" ]; then
  pass "origin/main 合并: 空本地发 D${GOT} > main max D${MAIN_MAX}（不漏号）"
elif [ -z "$MAIN_MAX" ]; then
  pass "origin/main 不可读 → 降级本地发号（CI 无 origin 时预期路径）"
else
  fail "origin/main 合并失败: 发 D$GOT 应 > main max $MAIN_MAX"
fi
echo ""

echo "── 7. CT-63: 远端分支名 D# 扫描 ──"
CT63_DIR=$(mktemp -d)
mkdir -p "$CT63_DIR/task-state"
echo '{"task_id":"D499","status":"claimed"}' > "$CT63_DIR/task-state/D499.json"
# D662 密封身份隔离: 沙箱 commit 显式注入身份（CI 零配置无 gecos fallback → empty ident name）
cd "$CT63_DIR" && git init -q && git add -A && git -c user.name=t -c user.email=t@t commit -q -m init
git update-ref refs/remotes/origin/feat/d605-test HEAD
cd "$REPO_DIR"
OUT=$(SYNO_TASK_STATE_DIR="$CT63_DIR/task-state" SYNO_BRIEF_DIR="$CT63_DIR/briefs" SYNO_ALLOC_NO_REMOTE=1 bash "$TOOL" "CT63" 2>&1)
GOT=$(echo "$OUT" | grep -oE 'D[0-9]+' | head -1 | sed 's/D//')
if [ -n "$GOT" ] && [ "$GOT" -gt 605 ]; then pass "CT-63: 分支 d605 → 发 D$GOT > 605"; else fail "CT-63: 发 D$GOT 应 > 605"; fi
rm -rf "$CT63_DIR"
echo ""

echo "── 8. CT-63 注入缝 NO_BRANCH=1 ──"
CT63B_DIR=$(mktemp -d)
mkdir -p "$CT63B_DIR/task-state"
echo '{"task_id":"D499","status":"claimed"}' > "$CT63B_DIR/task-state/D499.json"
# D662 密封身份隔离: 同上（CT-63 NO_BRANCH 场景）
cd "$CT63B_DIR" && git init -q && git add -A && git -c user.name=t -c user.email=t@t commit -q -m init
git update-ref refs/remotes/origin/feat/d605-test HEAD
cd "$REPO_DIR"
OUT=$(SYNO_TASK_STATE_DIR="$CT63B_DIR/task-state" SYNO_BRIEF_DIR="$CT63B_DIR/briefs" SYNO_ALLOC_NO_REMOTE=1 SYNO_ALLOC_NO_BRANCH=1 bash "$TOOL" "CT63B" 2>&1)
GOT=$(echo "$OUT" | grep -oE 'D[0-9]+' | head -1 | sed 's/D//')
if [ -n "$GOT" ] && [ "$GOT" -eq 500 ]; then pass "CT-63 NO_BRANCH: 发 D$GOT = 500"; else fail "CT-63 NO_BRANCH: 发 D$GOT 应 = 500"; fi
rm -rf "$CT63B_DIR"
echo ""

echo "── 9. D940 判别性[真实样本名]: 远端分支占 942 而本地未 fetch → 取号必须拒绝并点名 ──"
# 真实样本: origin 上确有 refs/heads/docs/d942-cto-fixation 与 docs/d943-cto-a-items。
# 关键条件「远端有、本地 branch -r 看不见」用**本地 bare 仓当 origin** 密封复刻
# （离线、CI 可跑、不连真网）；真仓当前**有** tracking ref，故不能直接用真仓构造该条件。
# ⚠ 夹具硬约束（c1 接口对齐 (A)）: 夹具 task-state 必须 max=941 →
#   计算表 941 → NEXT=942 → 发号前权威校验经 ls-remote 看到 d942 → 拒绝。
#   （c1 刻意不把 ls-remote 喂进「下一个号」计算表，否则 NEXT 会跳到 943、拒绝永不触发。）
mk_bare_fixture() {   # $1=夹具根目录；$2..=建在 bare origin 上的远端分支名；stdout=工作区路径
  local fix="$1"; shift
  local bare="$fix/origin.git" work="$fix/work" b
  git init -q --bare "$bare"
  git init -q "$work"
  mkdir -p "$work/task-state"
  cp "$REPO_DIR/task-state/TEMPLATE.json" "$work/task-state/TEMPLATE.json"
  printf '{"task_id":"D941","status":"claimed"}\n' > "$work/task-state/D941.json"
  ( cd "$work" && git add -A && git -c user.name=t -c user.email=t@t commit -q -m init \
      && git remote add origin "$bare" && git push -q origin HEAD:refs/heads/main )
  for b in "$@"; do
    git -C "$work" push -q origin "HEAD:refs/heads/$b"
    # 关键: 抹掉 push 可能顺带建立的 tracking ref → 复现"未 fetch"
    git -C "$work" update-ref -d "refs/remotes/origin/$b" 2>/dev/null || true
  done
  echo "$work"
}
F9=$(mktemp -d)
W9=$(mk_bare_fixture "$F9" "docs/d942-cto-fixation" "docs/d943-cto-a-items")
BLIND=$(git -C "$W9" branch -r --format='%(refname:short)' | grep -c 'd94[23]' || true)
SEEN=$(git -C "$W9" ls-remote --heads origin | grep -c 'd94[23]' || true)
if [ "$BLIND" = "0" ] && [ "$SEEN" = "2" ]; then
  pass "前置自校验: branch -r 看不见 d942/d943 ($BLIND)，ls-remote 看得见 ($SEEN)"
else
  fail "前置不成立: branch -r 命中=$BLIND 应为 0；ls-remote 命中=$SEEN 应为 2 —— 夹具未能复现「未 fetch」，后续断言无意义"
fi
EXIT=0
OUT=$(SYNO_TASK_STATE_DIR="$W9/task-state" SYNO_BRIEF_DIR="$F9/briefs" bash "$TOOL" "判别性-未fetch远端占942" 2>&1) || EXIT=$?
assert_ne0 "$EXIT" "未 fetch 的远端分支占用 → 拒绝（fail-closed，不发放）"
assert_contains "$OUT" "docs/d942-cto-fixation" "点名冲突位置（远端分支全 ref 原文）"
assert_lacks "$OUT" "已登记:" "拒绝时不建壳"
if [ ! -f "$W9/task-state/D942.json" ]; then pass "拒绝后未建 D942 壳"; else fail "拒绝却建了 D942 壳"; fi
rm -rf "$F9"
echo ""

echo "── 10. D940 判别性: worktree 目录名占 942（其它位置均无 942）→ 不得发放 942 ──"
# 隔离信号: 分支名**不含 D 号**、worktree 内**无 task-state** → 占用信号只在目录名。
# 断言取"不得发放 942"这一不变量（若拒绝则须点名 worktree）——两种实现口径下都成立，
# 旧实现（不扫目录名）会发放 D942 → 必红。
F10=$(mktemp -d); M10="$F10/main"
git init -q "$M10"
mkdir -p "$M10/task-state"
cp "$REPO_DIR/task-state/TEMPLATE.json" "$M10/task-state/TEMPLATE.json"
printf '{"task_id":"D941","status":"claimed"}\n' > "$M10/task-state/D941.json"
( cd "$M10" && git add -A && git -c user.name=t -c user.email=t@t commit -q -m init )
git -C "$M10" worktree add -q "$F10/.synova-wt-squad-d942" -b squad-probe >/dev/null 2>&1
if [ ! -f "$F10/.synova-wt-squad-d942/task-state/D942.json" ]; then
  pass "前置自校验: worktree 内无 D942.json（信号只在目录名）"
else
  fail "前置失败: worktree 内竟有 D942.json —— 信号未隔离到目录名"
fi
EXIT=0
OUT=$(SYNO_TASK_STATE_DIR="$M10/task-state" SYNO_BRIEF_DIR="$F10/briefs" \
      SYNO_ALLOC_NO_REMOTE=1 SYNO_ALLOC_NO_BRANCH=1 bash "$TOOL" "判别性-worktree名占942" 2>&1) || EXIT=$?
GOT10=$(printf '%s\n' "$OUT" | grep -oE '(^|[^A-Za-z0-9])D942([^0-9]|$)' | sed -n '1p' | grep -oE 'D942' || true)
if [ "$EXIT" != "0" ]; then
  assert_contains "$OUT" ".synova-wt-squad-d942" "拒绝并点名冲突位置（worktree 名原文）"
elif [ "$GOT10" = "D942" ]; then
  fail "worktree 目录名已占 942，却仍发放 D942（漏号）"
else
  pass "worktree 目录名占用 942 → 未发放 942（实际 exit=${EXIT}，无 D942 发放痕迹）"
fi
git -C "$M10" worktree remove --force "$F10/.synova-wt-squad-d942" >/dev/null 2>&1 || true
rm -rf "$F10"
echo ""

echo "── 11. D940 回归守卫: task-state 已占 942 → 绝不发放 942 ──"
# 注: 本用例在**旧实现**下也绿（NEXT=MAX+1=943，天然跳过）→ 是回归守卫、非判别性用例。
# 「task-state 已占」的判别性形态在 check-name-allocation.test.sh（校验器 --id 面）。
F11=$(mktemp -d); mkdir -p "$F11/task-state"
cp "$REPO_DIR/task-state/TEMPLATE.json" "$F11/task-state/TEMPLATE.json"
printf '{"task_id":"D941","status":"claimed"}\n' > "$F11/task-state/D941.json"
printf '{"task_id":"D942","status":"claimed"}\n' > "$F11/task-state/D942.json"
EXIT=0
OUT=$(SYNO_TASK_STATE_DIR="$F11/task-state" SYNO_BRIEF_DIR="$F11/briefs" \
      SYNO_ALLOC_NO_REMOTE=1 SYNO_ALLOC_NO_WORKTREE=1 SYNO_ALLOC_NO_BRANCH=1 bash "$TOOL" "回归-task-state占942" 2>&1) || EXIT=$?
FIRST11=$(printf '%s\n' "$OUT" | sed -n '1p')
case "$FIRST11" in
  D942) fail "task-state 已占 942，却发放了 D942" ;;
  D[0-9]*) pass "已占 942 → 未发放 942（实际 ${FIRST11}）" ;;
  *) fail "stdout 第一行不是 D#（契约偏离，非静默放行）: ${FIRST11:-<空>}" ;;
esac
rm -rf "$F11"
echo ""

echo "── 12. D940/E-M5 接线判别性: 本测试必须在 ci.yml 密封清单内（删掉该行即红）──"
# 沿 check-progress-freshness.test.sh:44 / merge_writeset_gate.test.sh:36 同款。
# 此前全仓只有 check-canary-drift.sh 能察觉本测试掉出清单，但它契约恒 exit 0（CI 里写作 `|| true`）
# ⇒ 非判别性防线（E-M5，d937-v 独立自验发现）。本条把"掉出密封清单"变成**红**。
grep -q 'alloc-task-id.test.sh' "$REPO_DIR/.github/workflows/ci.yml" \
  && pass "接线: 本测试在 ci.yml control-tower-tests 密封清单（删掉该行即红）" \
  || fail "接线: 本测试不在 ci.yml 密封清单（CI 不跑 = 摆设，M3 未接线）"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  结果: PASS=$PASS FAIL=$FAIL"
echo "═══════════════════════════════════════════════════════════"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
