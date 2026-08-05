#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# baseline-check.test.sh — D312 baseline-check 基线工具测试
#
# 覆盖（铁律 48：正常/降级/边界）:
#   1. --seed 后 3 条入基线；5 条 fixture 运行 → 存量 3 + 新增 2 + exit 1
#   2. 仅 3 条已知 fixture → 新增 0 + exit 0
#   3. --json 输出含 "added": 2（机器可读契约）
#   4. 基线目录缺失 → exit 0 + degraded + degraded-events.log 记录（fail-open）
#   5. --update-baseline 后 5 条全转存量 → 再跑新增 0 + exit 0
#
# 全部走 SYNO_ 注入缝（SYNO_TSC_OUTPUT 提供 fixture 输出），不跑真实 tsc。
# 用法: bash tests/control-tower/baseline-check.test.sh
# 退出码: 0 = 全部通过
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TOOL="$REPO_DIR/scripts/control-tower/baseline-check.sh"
TMP_DIR="$REPO_DIR/.codex/control-tower/tmp"
TMP_REL=".codex/control-tower/tmp"
DEGRADED_LOG="$REPO_DIR/.codex/control-tower/logs/degraded-events.log"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_contains() {
  if echo "$1" | grep -qF "$2"; then pass "$3"; else fail "$3 — 未找到: $2"; fi
}
assert_exit() {
  if [ "$1" = "$2" ]; then pass "$3 (exit=$2)"; else fail "$3 — 期望 exit=$1 实际=$2"; fi
}

mkdir -p "$TMP_DIR"
rm -f "$TMP_DIR"/bc-*.txt "$TMP_DIR"/bc-ct/* 2>/dev/null || true

# ── 测试 fixture: 3 条已知 + 2 条新错 ──
cat > "$TMP_REL/bc-known.txt" <<'EOF'
extensions/sentinels/_extinct/adaptation-velocity/aggregate.ts(1,38): error TS2307: Cannot find module '../../../src/sentinel/types'
extensions/sentinels/_extinct/capital-efficiency/aggregate.ts(7,38): error TS2307: Cannot find module '../../../src/sentinel/types'
src/connectors/ima.ts(143,64): error TS2345: Argument of type 'string' is not assignable
EOF
cat > "$TMP_REL/bc-new.txt" <<'EOF'
extensions/sentinels/_extinct/adaptation-velocity/aggregate.ts(1,38): error TS2307: Cannot find module '../../../src/sentinel/types'
extensions/sentinels/_extinct/capital-efficiency/aggregate.ts(7,38): error TS2307: Cannot find module '../../../src/sentinel/types'
src/connectors/ima.ts(143,64): error TS2345: Argument of type 'string' is not assignable
src/server.ts(500,10): error TS2345: NEW ERROR ONE
src/loops/new-engine.ts(10,5): error TS2322: NEW ERROR TWO
EOF

echo "═══════════════════════════════════════════════════════════"
echo "  D312 baseline-check 测试 — 基线工具"
echo "═══════════════════════════════════════════════════════════"
echo ""

# 每个场景独立 CT_DIR（隔离 baseline 状态）
CT_DIR="$TMP_REL/bc-ct"

echo "── 1. seed 3 条 → 5 条运行 → 存量 3 + 新增 2 ──"
rm -rf "$CT_DIR"; mkdir -p "$CT_DIR"
SYNO_CT_DIR="$CT_DIR" SYNO_TSC_OUTPUT="$TMP_REL/bc-known.txt" \
  bash "$TOOL" --tsc --seed > /dev/null 2>&1 || true
EXIT=0
OUT=$(SYNO_CT_DIR="$CT_DIR" SYNO_TSC_OUTPUT="$TMP_REL/bc-new.txt" \
  bash "$TOOL" --tsc 2>&1) || EXIT=$?
assert_exit 1 "$EXIT" "新增 2 条 → exit 1"
assert_contains "$OUT" "存量 3" "输出含存量 3"
assert_contains "$OUT" "新增 2" "输出含新增 2"
echo ""

echo "── 2. 仅 3 条已知 → 新增 0 + exit 0 ──"
EXIT=0
OUT=$(SYNO_CT_DIR="$CT_DIR" SYNO_TSC_OUTPUT="$TMP_REL/bc-known.txt" \
  bash "$TOOL" --tsc 2>&1) || EXIT=$?
assert_exit 0 "$EXIT" "无新增 → exit 0"
assert_contains "$OUT" "新增 0" "输出含新增 0"
echo ""

echo "── 3. --json 机器可读契约 ──"
OUT=$(SYNO_CT_DIR="$CT_DIR" SYNO_TSC_OUTPUT="$TMP_REL/bc-new.txt" \
  bash "$TOOL" --tsc --json 2>&1) || true
assert_contains "$OUT" '"added":2' '--json 含 "added":2'
assert_contains "$OUT" '"existing":3' '--json 含 "existing":3'
echo ""

echo "── 4. 基线目录缺失 → fail-open ──"
rm -rf "$CT_DIR"; mkdir -p "$CT_DIR"
EXIT=0
OUT=$(SYNO_CT_DIR="$CT_DIR" SYNO_TSC_OUTPUT="$TMP_REL/bc-known.txt" \
  bash "$TOOL" --tsc 2>&1) || EXIT=$?
assert_exit 0 "$EXIT" "基线缺失 → exit 0（fail-open）"
assert_contains "$OUT" "degraded" "输出含 degraded 标记"
# degraded 日志写在隔离 CT_DIR 下（脚本 DEGRADED_LOG=$CT_DIR/logs/...）
if grep -q "baseline-check" "$CT_DIR/logs/degraded-events.log" 2>/dev/null; then
  pass "degraded-events.log 有 baseline-check 记录"
else
  fail "degraded-events.log 无 baseline-check 记录 ($CT_DIR/logs/degraded-events.log)"
fi
echo ""

echo "── 5. --update-baseline 后全转存量 ──"
# update 需先有基线：seed 3 条 known → update 并入 5 条 new（并集 5 条）→ 再跑全存量
# 注: settings.json PostToolUse hook 可能拦截测试内 bash 写文件（verify-incremental 拖慢）→ timeout 保护
SYNO_CT_DIR="$CT_DIR" SYNO_TSC_OUTPUT="$TMP_REL/bc-known.txt" \
  timeout 20 bash "$TOOL" --tsc --seed > /dev/null 2>&1 || true
OUT=$(SYNO_CT_DIR="$CT_DIR" SYNO_TSC_OUTPUT="$TMP_REL/bc-new.txt" \
  timeout 20 bash "$TOOL" --tsc --update-baseline 2>&1) || true
assert_contains "$OUT" "基线已更新" "update 输出含基线已更新"
# update 后以 5 条 fixture 运行应全为存量
EXIT=0
OUT2=$(SYNO_CT_DIR="$CT_DIR" SYNO_TSC_OUTPUT="$TMP_REL/bc-new.txt" \
  timeout 20 bash "$TOOL" --tsc 2>&1) || EXIT=$?
assert_exit 0 "$EXIT" "update 后再跑 → exit 0"
assert_contains "$OUT2" "新增 0" "update 后新增 0"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  结果: $PASS 通过, $FAIL 失败"
if [ "$FAIL" -gt 0 ]; then
  echo "  Status: ❌ baseline-check 测试未通过"
  echo "═══════════════════════════════════════════════════════════"
  exit 1
fi
echo "  Status: ✅ baseline-check 测试全部通过"
echo "═══════════════════════════════════════════════════════════"
exit 0
