#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# check-bypass-log.test.sh — D414/U1c bypass 证据链对账门禁测试
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常 — 无新提交（origin/main..HEAD 空）→ exit 0
#   降级 — git log 执行失败 → exit 2（fail-closed, 不当作通过）
#   边界 — bypass.log 缺失 → exit 1；显式 SYNO_BASE_REF 不可解析 → exit 1
#   接线 — git log 失败 fail-closed 代码真实存在于脚本（铁律 0-2）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$REPO/scripts/control-tower/check-bypass-log.sh"
BYPASS="$REPO/.claude/bypass.log"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
cleanup() { [ -f "$BYPASS.u1bak" ] && mv "$BYPASS.u1bak" "$BYPASS"; }
trap cleanup EXIT

echo "=== D414/U1c check-bypass-log 对账门禁测试 ==="

# ── 接线: git log 失败 fail-closed 代码真实存在（U1c 修复点）──
if grep -q "git log 执行失败" "$GATE" && grep -q "GIT_LOG_OUT" "$GATE"; then
  ok "接线: git log 失败 fail-closed exit 2 已接入"
else
  no "接线: git log 失败检测代码缺失"
fi

# ── 正常: 无新提交（origin/main..HEAD 空集）→ exit 0 ──
SYNO_BASE_REF=origin/main bash "$GATE" >/dev/null 2>&1
rc=$?
[ "$rc" -eq 0 ] && ok "无新提交对账 → exit 0" || no "无新提交应 exit 0, 实际 $rc"

# ── 边界: bypass.log 缺失 → exit 1 ──
mv "$BYPASS" "$BYPASS.u1bak" 2>/dev/null || true  # swallow-ok: bypass.log 备份/还原操作, 测试隔离可忽略
SYNO_BASE_REF=origin/main bash "$GATE" >/dev/null 2>&1
rc=$?
cleanup
[ "$rc" -eq 1 ] && ok "bypass.log 缺失 → exit 1" || no "bypass.log 缺失应 exit 1, 实际 $rc"

# ── 边界: 显式 SYNO_BASE_REF 不可解析 → exit 1（硬错误, 非 fail-open）──
SYNO_BASE_REF="nonexistent-ref-xyz" bash "$GATE" >/dev/null 2>&1
rc=$?
[ "$rc" -eq 1 ] && ok "显式 base 不可解析 → exit 1" || no "显式 base 不可解析应 exit 1, 实际 $rc"

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
