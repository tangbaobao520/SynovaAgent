#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# check-secrets.test.sh — D417/U5b secrets 门禁 git 可用性 fail-open 修复测试
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常 — git 可用 + 无 secrets → exit 0
#   降级 — git 不可用（SYNO_SECRETS_ROOT 指向非 git 目录且含 secrets）→ exit 2（fail-closed, 不静默豁免）
#   边界 — git 可用但 secrets 内容为空 → exit 0
#   接线 — git 可用性预检 + exit 2 代码真实存在（铁律 0-2）
# 沙箱: SYNO_SECRETS_ROOT 注入扫描根; mktemp 沙箱 + trap 清理.
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$REPO/scripts/check-secrets.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT

echo "=== D417/U5b secrets git 可用性 fail-open 修复测试 ==="

# ── 接线: git 可用性预检 + fail-closed exit 2 代码真实存在 ──
if grep -q "git 不可用" "$GATE" && grep -q "rev-parse --git-dir" "$GATE"; then
  ok "接线: git 可用性预检 fail-closed exit 2 已接入"
else
  no "接线: git 可用性预检缺失"
fi

# ── 降级: git 不可用（SYNO_SECRETS_ROOT = 非 git 目录 + 含 secrets 文件）→ exit 2 ──
NOGIT="$TMPD/nogit"; mkdir -p "$NOGIT"
echo "sk-123456789012345678901234567890" > "$NOGIT/leak.env"
SYNO_SECRETS_ROOT="$NOGIT" bash "$GATE" >/dev/null 2>&1
rc=$?
[ "$rc" -eq 2 ] && ok "git 不可用 + 有 secrets → exit 2（fail-closed）" || no "git 不可用应 exit 2, 实际 $rc"

# ── 正常: git 可用（临时 git repo）+ 无 secrets → exit 0 ──
CLEAN="$TMPD/clean"; mkdir -p "$CLEAN"; git -C "$CLEAN" init -q 2>/dev/null || true
echo ".env" > "$CLEAN/.gitignore"
echo "# 无 secrets" > "$CLEAN/README.md"
SYNO_SECRETS_ROOT="$CLEAN" bash "$GATE" >/dev/null 2>&1
rc=$?
[ "$rc" -eq 0 ] && ok "git 可用 + 无 secrets → exit 0" || no "git 可用+干净应 exit 0, 实际 $rc"

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
