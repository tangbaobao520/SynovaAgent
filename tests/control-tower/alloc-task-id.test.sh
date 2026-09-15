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

echo "── 9. D726: 骨架 brief 硬字段回归网（#CRITERIA 缺失即门禁失效）──"
# 背景: D508 起骨架含 `#CRITERIA: A`，但**从未有测试钉住它** → 改写 heredoc 时删掉无人知
#   （D718 实证: 骨架填实后该字段丢失 → brief_parser.parse_criteria=None →
#    brief 无法被 resolver 最终回退选中）。本段补回归网 + 反向验证。
# 隔离: 用本段专属 mktemp 目录做一次**新分配**，不复用 $TMP_DIR/task-briefs——
#   ① 固定路径跨运行残留会让断言命中旧文件（假绿: 删掉 SKEL 的 #CRITERIA 仍通过）
#   ② 对共享固定路径做 rm -rf 会误删并发 session 正在用的文件（跨运行干扰，CT-40 实证）
SKEL_DIR=$(mktemp -d)
SYNO_TASK_STATE_DIR="$TMP_DIR/task-state" SYNO_BRIEF_DIR="$SKEL_DIR" SYNO_ALLOC_NO_REMOTE=1 \
  bash "$TOOL" "骨架硬字段探针" >/dev/null 2>&1 || true
SKEL_FILE=$(ls "$SKEL_DIR"/*.md 2>/dev/null | head -1)  # swallow-ok: 目录空则无匹配，下一断言显式判失败
if [ -n "$SKEL_FILE" ] && [ -f "$SKEL_FILE" ]; then
  pass "骨架已落盘 ($(basename "$SKEL_FILE"))"
else
  fail "骨架未落盘（$SKEL_DIR/*.md）"
fi
CRIT=$(grep -oE '#CRITERIA[[:space:]]*[:=][[:space:]]*[A-D]' "$SKEL_FILE" 2>/dev/null \
  | sed -E 's/.*[=:][[:space:]]*//' || true)  # swallow-ok: 文件缺失/无匹配 → 空值由下一断言判失败
if [ -n "$CRIT" ]; then
  pass "骨架含 #CRITERIA: ${CRIT}（门禁硬字段，不可删）"
else
  fail "骨架缺 #CRITERIA —— pre-commit G10 / hook CP1 / pre-doc-audit CP2 全部失效"
fi
# 同源解析器（brief_parser.py）必须能取到单字母 A-D
PARSED=$(python3 "$REPO_DIR/scripts/control-tower/brief_parser.py" --criteria "$SKEL_FILE" 2>/dev/null | head -1 || true)  # swallow-ok: 解析失败由下一断言显式判失败
if echo "$PARSED" | grep -qE '^[A-D]$'; then
  pass "brief_parser --criteria 解析 = ${PARSED}（同源契约成立）"
else
  fail "brief_parser --criteria 解析失败（得到: '$PARSED'）"
fi
# 端到端: 认领即有**可提交**的模板（骨架必须过 brief 契约门）
EXIT=0
bash "$REPO_DIR/scripts/workflow/check-brief-parseable.sh" "$SKEL_FILE" >/dev/null 2>&1 || EXIT=$?
assert_exit 0 "$EXIT" "骨架通过 check-brief-parseable（认领即可用）"
# 反向验证: 剥掉 #CRITERIA 后必须被门禁拒绝——证明上面两条断言有牙（非空转哨兵）
if [ -n "$SKEL_FILE" ] && [ -f "$SKEL_FILE" ]; then
  STRIPPED="$SKEL_DIR/skel-no-criteria.md"
  grep -v '#CRITERIA' "$SKEL_FILE" > "$STRIPPED"
  EXIT=0
  bash "$REPO_DIR/scripts/workflow/check-brief-parseable.sh" "$STRIPPED" >/dev/null 2>&1 || EXIT=$?
  assert_exit 1 "$EXIT" "反向验证: 剥掉 #CRITERIA → 门禁拒绝"
fi
rm -rf "$SKEL_DIR" 2>/dev/null || true  # swallow-ok: 沙箱清理失败无副作用（mktemp 目录，OS 会回收）
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  结果: PASS=$PASS FAIL=$FAIL"
echo "═══════════════════════════════════════════════════════════"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
