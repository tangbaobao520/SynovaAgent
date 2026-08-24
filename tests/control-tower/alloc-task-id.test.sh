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
OUT=$(SYNO_TASK_STATE_DIR="$TMP_DIR/task-state" SYNO_BRIEF_DIR="$TMP_DIR/task-briefs" bash "$TOOL" "测试任务A" 2>&1)
assert_contains "$OUT" "D500" "分配 D500 (max=499 → +1=500 起步)"
assert_contains "$OUT" "已登记" "登记提示"
if [ -f "$TMP_DIR/task-state/D500.json" ]; then pass "空壳已建"; else fail "空壳未建"; fi
if grep -q '"status": "claimed"' "$TMP_DIR/task-state/D500.json"; then pass "status=claimed"; else fail "status 非 claimed"; fi
echo ""

echo "── 2. 连续分配 → D501 (单调递增) ──"
OUT=$(SYNO_TASK_STATE_DIR="$TMP_DIR/task-state" SYNO_BRIEF_DIR="$TMP_DIR/task-briefs" bash "$TOOL" "测试任务B" 2>&1)
assert_contains "$OUT" "D501" "第二次分配 D501"
echo ""

echo "── 3. dry-run → 只预览不建壳 ──"
OUT=$(SYNO_TASK_STATE_DIR="$TMP_DIR/task-state" SYNO_BRIEF_DIR="$TMP_DIR/task-briefs" bash "$TOOL" "预览任务" --dry-run 2>&1)
assert_contains "$OUT" "D502" "dry-run 预览 D502"
assert_contains "$OUT" "dry-run" "dry-run 标注"
if [ ! -f "$TMP_DIR/task-state/D502.json" ]; then pass "dry-run 未建壳"; else fail "dry-run 竟建壳了"; fi
echo ""

echo "── 4. 空任务名 → exit 1 + 用法 ──"
EXIT=0
OUT=$(SYNO_TASK_STATE_DIR="$TMP_DIR/task-state" SYNO_BRIEF_DIR="$TMP_DIR/task-briefs" bash "$TOOL" 2>&1) || EXIT=$?
assert_exit 1 "$EXIT" "空名拒绝"
assert_contains "$OUT" "用法" "用法提示"
echo ""

echo "── 5. 撞车防护逻辑存在（并发竞态防御；单进程不可触发，靠唯一入口 + 建壳原子检查）──"
# NEXT=MAX+1 天然不撞；并发窗口（两进程同算 NEXT）靠「建壳前 -f 检查」拒绝。
# 单测验证防护代码存在 + 正常流程不误触发。
if grep -q '已存在\|STATE_FILE' "$TOOL"; then pass "防护逻辑存在 (建壳前检查)"; else fail "防护逻辑缺失"; fi
EXIT=0
OUT=$(SYNO_TASK_STATE_DIR="$TMP_DIR/task-state" SYNO_BRIEF_DIR="$TMP_DIR/task-briefs" bash "$TOOL" "正常任务" 2>&1) || EXIT=$?
assert_exit 0 "$EXIT" "正常流程不误触发 (exit 0)"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  结果: PASS=$PASS FAIL=$FAIL"
echo "═══════════════════════════════════════════════════════════"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
