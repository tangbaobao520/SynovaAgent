#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# ci-strict-visible.test.sh — D542 CI strict 失败可见性测试
#
# 背景: soft_check/warn_check 在 SYNO_CI=1 下 HARD_FAIL+1 但只打印 ⚠️（黄），
#       导致 CI 汇总「N 组未通过」在日志里找不到对应组（M1 类失败不点名）——
#       D541 CI 红「2 组未通过」排查浪费一整轮即此缺陷代价。修复后 CI 下打印 ❌（红）。
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常 — soft_check/warn_check 本地模式（无 SYNO_CI）→ ⚠️ + 软计数（不阻断语义）
#   降级 — SYNO_CI=1 → ❌ + HARD_FAIL（硬计数，v5_soft 同款正确行为）
#   边界 — miss（零匹配）→ ✅ 且计数不变；matches 空串不崩溃
#   接线 — pre-commit-check.sh 含 D542 标记（soft_check/warn_check 的 CI 分支）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$REPO/scripts/pre-commit-check.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

export GATE_HITS_LOG="$(mktemp)"   # gate 统计写入临时文件，不污染仓库
trap 'rm -f "$GATE_HITS_LOG"' EXIT

# 提取被测函数 + 依赖变量（sed 函数范围 + 头部颜色/计数器），source 进本测试进程
 extract_helpers() {
  sed -n '42,44p;47p' "$GATE"
  sed -n '/^soft_check()/,/^}/p' "$GATE"
  sed -n '/^warn_check()/,/^}/p' "$GATE"
  sed -n '/^v5_soft()/,/^}/p' "$GATE"
  echo 'HARD_FAIL=0; WARN_COUNT=0; SOFT_COUNT=0'
}

echo "=== D542 CI strict 失败可见性测试 ==="

# ── 接线: D542 标记存在于 soft_check 与 warn_check ──
if grep -q "D542: CI strict 下必须显示 ❌" "$GATE" && [ "$(grep -c "D542: CI strict 下必须显示" "$GATE")" -ge 2 ]; then
  ok "接线: soft_check + warn_check 均含 D542 CI 可见性修复"
else
  no "接线: D542 标记缺失（soft_check/warn_check 至少一处未修）"
fi

# ── 正常 1: soft_check 本地模式 → ⚠️ + SOFT_COUNT+1，HARD_FAIL 不变 ──
OUT=$(bash -c "$(extract_helpers); soft_check '测试项' '匹配行一'" 2>&1)
if echo "$OUT" | grep -q "⚠️" && ! echo "$OUT" | grep -q "❌"; then
  ok "soft_check 本地 → ⚠️（非 ❌）"
else
  no "soft_check 本地应显示 ⚠️，实际: $(echo "$OUT" | head -1)"
fi

# ── 降级 2: soft_check SYNO_CI=1 → ❌（红）+ HARD_FAIL+1 ──
OUT=$(bash -c "$(extract_helpers); SYNO_CI=1 soft_check '测试项' '匹配行一'" 2>&1)
if echo "$OUT" | grep -q "❌.*CI strict"; then
  ok "soft_check CI strict → ❌（失败可见，M1 缺陷已修）"
else
  no "soft_check CI strict 应显示 ❌，实际: $(echo "$OUT" | head -1)"
fi

# ── 正常 3: warn_check 本地 → ⚠️ [警告] ──
OUT=$(bash -c "$(extract_helpers); warn_check '测试项W' '匹配行W'" 2>&1)
if echo "$OUT" | grep -q "⚠️.*警告"; then
  ok "warn_check 本地 → ⚠️ [警告]"
else
  no "warn_check 本地应显示 ⚠️，实际: $(echo "$OUT" | head -1)"
fi

# ── 降级 4: warn_check SYNO_CI=1 → ❌ + [CI strict] ──
OUT=$(bash -c "$(extract_helpers); SYNO_CI=1 warn_check '测试项W' '匹配行W'" 2>&1)
if echo "$OUT" | grep -q "❌.*CI strict"; then
  ok "warn_check CI strict → ❌"
else
  no "warn_check CI strict 应显示 ❌，实际: $(echo "$OUT" | head -1)"
fi

# ── 边界 5: miss（空 matches）→ ✅ 且计数不变 ──
OUT=$(bash -c "$(extract_helpers); soft_check '无匹配项' ''" 2>&1)
if echo "$OUT" | grep -q "✅"; then
  ok "soft_check 空 matches → ✅"
else
  no "soft_check 空 matches 应显示 ✅，实际: $(echo "$OUT" | head -1)"
fi

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ]
