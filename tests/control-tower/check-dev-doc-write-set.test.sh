#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# check-dev-doc-write-set.test.sh — D415/U2 dev doc 写集双向对账门禁测试
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常 — 写集=实际变更 → exit 0
#   降级 —（fail-open 路径由既有 write-set-check.test.sh 覆盖）
#   边界 — 反向漂移（实际变更但未登记）→ exit 1 点名; 文档类豁免（不算漂移）→ exit 0
#   接线 — 反向对账代码真实存在于脚本（铁律 0-2）
# 沙箱: SYNO_DEV_DOC 注入 dev doc（跳过得正向对账）+ SYNO_STAGED_FILES 注入暂存文件;
#       mktemp 沙箱 + trap 清理, 零真实 git 暂存.
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$REPO/scripts/workflow/check-dev-doc-write-set.sh"
TMPD="$(mktemp -d)"
trap 'rm -rf "$TMPD"' EXIT
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "=== D415/U2 写集双向对账门禁测试 ==="

# ── 接线: 反向对账代码真实存在 ──
if grep -q "实际变更但未登记" "$GATE" && grep -q "SYNO_STAGED_FILES" "$GATE"; then
  ok "接线: 反向对账已接入"
else
  no "接线: 反向对账缺失"
fi

# ── 临时 dev doc（写集声明真实存在的控制塔脚本——正向对账存在性检查要求真实存在）──
REAL="scripts/control-tower/devdoc_writeset.py"
OTHER="scripts/control-tower/staging_guard.py"
DEVDOC="$TMPD/SYNOVA-IMPL-D998-u2test.md"
cat > "$DEVDOC" <<EOF
### 3.1 写集 (1 修改)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| $REAL | 修改 | 测试 |
EOF

# ── 正常: 写集=实际（已登记）→ exit 0 ──
SYNO_DEV_DOC="$DEVDOC" SYNO_STAGED_FILES="$REAL" bash "$GATE" >/dev/null 2>&1
rc=$?
[ "$rc" -eq 0 ] && ok "写集=实际 → exit 0" || no "写集=实际应 exit 0, 实际 $rc"

# ── 边界: 反向漂移（实际多了未登记的真实文件）→ exit 1 且点名 ──
OUT=$(SYNO_DEV_DOC="$DEVDOC" SYNO_STAGED_FILES="$REAL
$OTHER" bash "$GATE" 2>&1)
rc=$?
if [ "$rc" -eq 1 ] && echo "$OUT" | grep -q "$OTHER"; then
  ok "反向漂移: 未登记 $OTHER 检出 → exit 1"
else
  no "反向漂移应 exit 1 且点名 $OTHER, 实际 rc=$rc"
fi

# ── 边界: 文档豁免（实际含 docs/foo.md 文档类）→ 不算漂移 exit 0 ──
SYNO_DEV_DOC="$DEVDOC" SYNO_STAGED_FILES="$REAL
docs/foo.md" bash "$GATE" >/dev/null 2>&1
rc=$?
[ "$rc" -eq 0 ] && ok "文档豁免: docs/ 不算漂移 → exit 0" || no "文档豁免应 exit 0, 实际 $rc"

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
