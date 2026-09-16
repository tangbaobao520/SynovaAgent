#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# dev-doc-gatekeeper.test.sh — D661 C1/C2 提取回归（\d/\b/\s → POSIX ERE）
#
# 覆盖矩阵（铁律 48）:
#   正常 — C1 Edge ID 提取（E-\d{2}→E-[0-9]{2}）命中
#   正常 — C2 文件路径提取（\b→显式边界 + sed strip）命中
#   回归 — 脚本零 grep -P（BSD grep 无 -P）
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
GK="$REPO_DIR/scripts/control-tower/dev-doc-gatekeeper.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "=== D661: dev-doc-gatekeeper C1/C2 提取回归 ==="

D=$(mktemp -d); trap 'rm -rf "$D"' EXIT
DOC="$D/doc.md"
cat > "$DOC" <<'EOF'
## 写集
- src/definitely-not-exist-xyz.ts
Edge 引用: E-99
EOF

set +e
OUT=$(bash "$GK" "$DOC" 2>&1)
set -e

# C1: 若 grep -oE 'E-[0-9]{2}' 失效 → 显示"未引用 Edge ID（跳过）"而非点名为不存在
if echo "$OUT" | grep -q 'E-99'; then ok "C1 提取 Edge ID E-99（E-[0-9]{2} 生效）"; else no "C1 未提取 E-99（grep -oE 'E-[0-9]{2}' 失效）"; fi

# C2: 若 \b→显式边界 + sed strip 失效 → 显示"未引用文件路径（跳过）"
if echo "$OUT" | grep -q 'definitely-not-exist-xyz'; then ok "C2 提取文件路径（显式边界+sed strip 生效）"; else no "C2 未提取路径（\b/\s→ERE 失效）"; fi

# 回归网
if grep -qE 'grep[[:space:]]+-[a-zA-Z]*P' "$GK"; then no "dev-doc-gatekeeper.sh 残留 grep -P"; else ok "dev-doc-gatekeeper.sh 零 grep -P"; fi

echo ""
echo "  结果: $PASS 通过, $FAIL 失败"
if [ "$FAIL" -gt 0 ]; then
  echo "  Status: ❌ dev-doc-gatekeeper 测试未通过"
  exit 1
fi
echo "  Status: ✅ dev-doc-gatekeeper 测试全部通过"
exit 0
