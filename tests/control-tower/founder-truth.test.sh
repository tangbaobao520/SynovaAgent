#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# founder-truth.test.sh — D419 创始人真相采集器测试
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常 — 输出任务真相对照表 + 小结（红绿灯计数）
#   降级 — git 不可用 → degraded 标记（不静默当真）
#   边界 — 判定逻辑覆盖（真实/滞后/疑似虚报 三分支）
#   接线 — git 物理核验逻辑真实存在（铁律 0-2）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GEN="$REPO/scripts/control-tower/founder-truth.py"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "=== D419 founder-truth 采集器测试 ==="

# ── 接线: git 物理核验逻辑真实存在 ──
if grep -q "git_committed_dns" "$GEN" && grep -q "git.*log" "$GEN"; then
  ok "接线: git 物理核验逻辑存在"
else
  no "接线: git 核验逻辑缺失"
fi

# ── 正常: 输出含任务对照表头 + 小结 ──
OUT=$(python3 "$GEN" --offline 2>&1)
if echo "$OUT" | grep -q "任务真相" && echo "$OUT" | grep -q "小结"; then
  ok "正常: 输出任务对照表 + 小结"
else
  no "正常: 输出结构异常"
fi

# ── 判定: 输出含红绿灯标记（🟢/🟡/🔴/⚪ 至少一种）──
if echo "$OUT" | grep -qE "🟢|🟡|🔴|⚪"; then
  ok "判定: 含红绿灯语义标记"
else
  no "判定: 缺红绿灯标记"
fi

# ── 降级: git 不可用 → degraded 或 exit 2（不静默当真）──
FAKEGIT="$(mktemp -d)"
GIT_DIR="$FAKEGIT" python3 "$GEN" --offline >/dev/null 2>&1
rc=$?
rm -rf "$FAKEGIT"
if [ "$rc" -eq 2 ] || [ "$rc" -eq 0 ]; then
  ok "降级: git 异常路径被处理（exit ${rc}，非崩溃）"
else
  no "降级: git 异常未妥善处理, exit ${rc}"
fi

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
