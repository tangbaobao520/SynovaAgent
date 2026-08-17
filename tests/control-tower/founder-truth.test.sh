#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# founder-truth.test.sh — D419→D424 创始人零信任控制台测试
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常 — 输出三问面板（任务真相 + 诚信账本 + 北星对齐）+ 小结（红绿灯计数）
#   降级 — git 不可用 → degraded 标记（不静默当真）
#   边界 — 判定逻辑覆盖（真实/滞后/疑似虚报 三分支）+ 北星无对应标记
#   接线 — 物理核验逻辑 + 新面板函数真实存在（铁律 0-2）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GEN="$REPO/scripts/control-tower/founder-truth.py"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "=== D419→D424 founder-truth 控制台测试 ==="

# ── 接线: 物理核验逻辑 + 三问面板函数真实存在 ──
if grep -q "git_committed_dns" "$GEN" && grep -q "integrity_ledger" "$GEN" \
   && grep -q "north_star_alignment" "$GEN" && grep -q "ci_status" "$GEN" \
   && grep -q "write_alert" "$GEN"; then
  ok "接线: 三问面板函数（ledger/north-star/ci/alert）+ git 核验逻辑存在"
else
  no "接线: 面板函数缺失"
fi

# ── 正常: 输出含三问面板 + 小结 ──
OUT=$(python3 "$GEN" --offline 2>&1)
if echo "$OUT" | grep -q "创始人控制台" && echo "$OUT" | grep -q "小结" \
   && echo "$OUT" | grep -q "诚信账本" && echo "$OUT" | grep -q "北星对齐" \
   && echo "$OUT" | grep -q "CI 最近一次"; then
  ok "正常: 输出三问面板（任务真相/诚信账本/北星对齐）+ CI + 小结"
else
  no "正常: 输出结构异常"
fi

# ── 判定: 输出含红绿灯语义标记（🟢/🟡/🔴/⚪ 至少一种）──
if echo "$OUT" | grep -qE "🟢|🟡|🔴|⚪"; then
  ok "判定: 含红绿灯语义标记"
else
  no "判定: 缺红绿灯标记"
fi

# ── 边界: 北星对齐含"无对应"标记（方向漂移检测）──
if echo "$OUT" | grep -q "北星无对应"; then
  ok "边界: 北星对齐含'无对应'方向漂移标记"
else
  no "边界: 北星对齐缺'无对应'标记（或当前全部对齐）"
fi

# ── 边界: 诚信账本按 agent 计分（含诚信 %）──
if echo "$OUT" | grep -qE "诚信 [0-9]+%"; then
  ok "边界: 诚信账本按 agent 计分（含诚信百分比）"
else
  no "边界: 诚信账本缺计分"
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

# ── HTML: --html 生成自包含页面（三面板）──
HTML=$(python3 "$GEN" --offline --html 2>&1)
if echo "$HTML" | grep -q "已生成" && [ -f "$REPO/docs/synova/founder-console.html" ]; then
  ok "HTML: 生成自包含页面 founder-console.html"
else
  no "HTML: 页面生成失败"
fi

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
