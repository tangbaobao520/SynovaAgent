#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# gen-cto-health-repro.test.sh — D412/U3 产物可复现校验（phantom 根治）
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常 — 无 phantom: --strict exit 0
#   降级 — phantom 工件（工作区有但未提交 git）: spec 标 ⚠ 非 ✅；非 strict exit 0（只标记）
#        — git 不可用: exit 2（degraded，不静默当真）
#   边界 — phantom + --strict → exit 1；清理 phantom 后 strict → exit 0
#   接线 — _head_tracked_files 真实接入 analyze_task_state（铁律 0-2 WIRE CHECK）
# 真实性: 真实 git 仓库跑（铁律 12 不 mock）；phantom 文件测试后 trap 强制清理.
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GEN="$REPO/scripts/control-tower/gen-cto-health.py"
DEVDOC_DIR="$REPO/docs/plans/codex/implementation"
PHANTOM_DOC="$DEVDOC_DIR/SYNOVA-IMPL-DSH-D999-u3test.md"
PHANTOM_TS="$REPO/task-state/D999.json"

PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
cleanup() { rm -f "$PHANTOM_DOC" "$PHANTOM_TS"; }
trap cleanup EXIT

echo "=== D412/U3 产物可复现校验（phantom 根治）测试 ==="

# ── 接线: _head_tracked_files 真实存在并被 analyze_task_state 调用 ──
if grep -q "def _head_tracked_files" "$GEN" && grep -q "head_files = _head_tracked_files()" "$GEN"; then
  ok "接线: _head_tracked_files 已接入 analyze_task_state"
else
  no "接线: _head_tracked_files 未接线"
fi

# ── 正常: 无 phantom → --strict exit 0 ──
python3 "$GEN" --dry-run --strict >/dev/null 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then ok "无 phantom: --strict exit 0"; else no "无 phantom: --strict 应 exit 0, 实际 $rc"; fi

# ── 制造 phantom（工作区有 dev doc + task-state, 但未提交 git）──
mkdir -p "$DEVDOC_DIR"
echo "# phantom（U3 测试, 未提交 git）" > "$PHANTOM_DOC"
printf '{"task_id":"D999","title":"u3测试","status":"claimed"}\n' > "$PHANTOM_TS"

# ── 降级: phantom → dry-run 中 D999 spec 标 ⚠ 而非 ✅ ──
OUT="$(python3 "$GEN" --dry-run 2>&1)"
if echo "$OUT" | grep "D999" | grep -q "⚠"; then
  ok "phantom 标记: D999 spec 显示 ⚠（非 ✅）"
else
  no "phantom 标记: D999 spec 应为 ⚠，实际: $(echo "$OUT" | grep D999)"
fi

# ── 边界: phantom + --strict → exit 1（检出阻断）──
python3 "$GEN" --dry-run --strict >/dev/null 2>&1
rc=$?
if [ "$rc" -eq 1 ]; then ok "phantom + --strict → exit 1"; else no "phantom + --strict 应 exit 1, 实际 $rc"; fi

# ── 降级: phantom + 非 strict → exit 0（只标记不阻断）──
python3 "$GEN" --dry-run >/dev/null 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then ok "phantom + 非 strict → exit 0"; else no "phantom + 非 strict 应 exit 0, 实际 $rc"; fi

# ── 边界: 清理 phantom → --strict exit 0 ──
cleanup
python3 "$GEN" --dry-run --strict >/dev/null 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then ok "清理 phantom 后 --strict → exit 0"; else no "清理后 --strict 应 exit 0, 实际 $rc"; fi

# ── 降级: git 不可用（GIT_DIR 指向空目录）→ exit 2（degraded，不静默当真）──
FAKEGIT="$(mktemp -d)"
GIT_DIR="$FAKEGIT" python3 "$GEN" --dry-run >/dev/null 2>&1
rc=$?
rm -rf "$FAKEGIT"
if [ "$rc" -eq 2 ]; then ok "git 不可用 → exit 2（degraded）"; else no "git 不可用应 exit 2, 实际 $rc"; fi

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
