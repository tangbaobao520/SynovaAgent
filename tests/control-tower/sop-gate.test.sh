#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# sop-gate.test.sh — U6/D416 Mac DSH SOP 步骤物理卡点测试
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常 — step 2 合规 brief → exit 0; step 7 bypass.log 无变更 → exit 0
#   降级 — step 5 无 node_modules → exit 2（degraded）
#   边界 — step 2 brief 缺字段 → exit 1; step 2 brief 不存在 → exit 1
#   接线 — sop-gate.sh 真实存在
# 沙箱: 临时 brief 创建于 task-briefs/ 后 trap 强制清理.
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$REPO/scripts/workflow/sop-gate.sh"
TDIR="$REPO/.claude/task-briefs"
GOOD_BRIEF="2026-08-17-D416-sopgate-good.md"
BAD_BRIEF="2026-08-17-D416-sopgate-bad.md"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
cleanup() { rm -f "$TDIR/$GOOD_BRIEF" "$TDIR/$BAD_BRIEF"; }
trap cleanup EXIT

echo "=== U6/D416 sop-gate SOP 物理卡点测试 ==="

# ── 接线: sop-gate.sh 真实存在 ──
[ -f "$GATE" ] && ok "接线: sop-gate.sh 存在" || no "sop-gate.sh 缺失"

# ── 准备: 合规 brief（6 字段）与缺字段 brief ──
cat > "$TDIR/$GOOD_BRIEF" <<'EOF'
## Q0: 定位
## Q1: 调研
## Q2: 范围
## Q3: 验收
## 架构层: L1
## Done 标准: x
EOF
printf '## Q0: 定位\n## Q1: 调研\n' > "$TDIR/$BAD_BRIEF"

# ── 正常: step 2 合规 brief → exit 0 ──
bash "$GATE" --step 2 --brief "$GOOD_BRIEF" >/dev/null 2>&1
rc=$?
[ "$rc" -eq 0 ] && ok "step 2 合规 brief → exit 0" || no "step 2 合规 brief 应 exit 0, 实际 $rc"

# ── 边界: step 2 brief 缺字段 → exit 1 ──
bash "$GATE" --step 2 --brief "$BAD_BRIEF" >/dev/null 2>&1
rc=$?
[ "$rc" -eq 1 ] && ok "step 2 brief 缺字段 → exit 1" || no "step 2 缺字段应 exit 1, 实际 $rc"

# ── 边界: step 2 brief 不存在 → exit 1 ──
bash "$GATE" --step 2 --brief "nonexistent-xyz.md" >/dev/null 2>&1
rc=$?
[ "$rc" -eq 1 ] && ok "step 2 brief 不存在 → exit 1" || no "step 2 brief 不存在应 exit 1, 实际 $rc"

# ── 降级: step 5 无 node_modules（/tmp worktree）→ exit 2 ──
if [ ! -d "$REPO/node_modules" ]; then
  bash "$GATE" --step 5 >/dev/null 2>&1
  rc=$?
  [ "$rc" -eq 2 ] && ok "step 5 无 node_modules → exit 2 degraded" || no "step 5 无 node_modules 应 exit 2, 实际 $rc"
fi

# ── 正常: step 7 bypass.log 无未提交变更 → exit 0 ──
bash "$GATE" --step 7 >/dev/null 2>&1
rc=$?
[ "$rc" -eq 0 ] && ok "step 7 bypass.log 无变更 → exit 0" || no "step 7 无变更应 exit 0, 实际 $rc"

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
