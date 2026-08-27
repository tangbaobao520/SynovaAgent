#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# brief-parser-strip.test.sh — D521/不变量3: 语义 parser 统一剥壳（include/exclude 对称）
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常 — include「改 src/x.ts（说明）」→ 裸路径 src/x.ts
#   正常 — include「新增 src/y.sh — 原因」→ 裸路径
#   边界 — include 无修饰裸路径 → 原样通过（不回归）
#   边界 — exclude「不改 scripts/audit/（红线）」→ 剥壳保持（既有语义不回归）
#   D543 — include「scripts/x.sh L750」剥行号后缀 → 裸路径（对齐 devdoc_writeset）
#   接线 — resolve-commit-brief.sh 内嵌降级解析器同步含剥壳正则
# 沙箱: 纯文本 fixture 注入，零 git
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PARSER="$REPO/scripts/control-tower/brief_parser.py"
RESOLVER="$REPO/scripts/workflow/resolve-commit-brief.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "=== D521 不变量3: parser 剥壳对称 ==="

FIXTURE="$(mktemp)"; trap 'rm -f "$FIXTURE"' EXIT
cat > "$FIXTURE" <<'EOF'
## Q2: 范围
做什么:
- 改 src/l3/foo.ts（专家路由）
- 修改 src/l4/bar.ts — 性能
- 新增 scripts/control-tower/new-gate.sh
- 修复 scripts/workflow/task-start.sh: CRLF
- 实现 tests/l3/foo.test.ts
- src/plain/already-bare.py
- scripts/pre-commit-check.sh L750
不做什么:
- 不改 scripts/audit/（K3 专属红线）
- 不动 src/immutable/core.ts

## Done 标准:
- verify: echo ok
EOF

INCLUDES=$(python3 "$PARSER" --q2-include "$FIXTURE")
EXCLUDES=$(python3 "$PARSER" --q2-exclude "$FIXTURE")

# ── 正常: include 剥动词前缀 + 括号 + 后置分隔 ──
echo "$INCLUDES" | grep -qx "src/l3/foo.ts" && ok "include 剥「改 + （说明）」→ src/l3/foo.ts" || no "改/括号未剥: $(echo "$INCLUDES" | head -2)"
echo "$INCLUDES" | grep -qx "src/l4/bar.ts" && ok "include 剥「修改 + — 原因」→ src/l4/bar.ts" || no "修改/— 未剥"
echo "$INCLUDES" | grep -qx "scripts/control-tower/new-gate.sh" && ok "include 剥「新增」" || no "新增未剥"
echo "$INCLUDES" | grep -qx "scripts/workflow/task-start.sh" && ok "include 剥「修复 + : 后缀」" || no "修复/: 未剥"
echo "$INCLUDES" | grep -qx "tests/l3/foo.test.ts" && ok "include 剥「实现」" || no "实现未剥"

# ── D543: 剥行号后缀「path L750」（对齐 devdoc_writeset 同款正则；D541 CI 红第三处根因）──
echo "$INCLUDES" | grep -qx "scripts/pre-commit-check.sh" && ok "D543: 剥「L750」行号后缀 → 裸路径" || no "D543: L\d+ 后缀未剥: $(echo "$INCLUDES" | grep pre-commit | head -1)"
echo "$INCLUDES" | grep -qE "pre-commit-check.sh L[0-9]" && no "D543: 行号后缀残留" || ok "D543: 无 L\d+ 残留"

# ── 边界: 裸路径原样、exclude 剥壳语义不回归 ──
echo "$INCLUDES" | grep -qx "src/plain/already-bare.py" && ok "裸路径原样通过（不回归）" || no "裸路径被破坏"
echo "$EXCLUDES" | grep -qx "scripts/audit/" && ok "exclude 剥「不改 + （）」保持" || no "exclude 剥壳回归"
echo "$EXCLUDES" | grep -qx "src/immutable/core.ts" && ok "exclude 剥「不动」保持" || no "exclude 不动回归"

# ── 接线: resolve-commit-brief.sh 内嵌降级解析器同步 ──
grep -qE "修改\|新增\|新建\|修复\|扩展\|实现\|更新\|重构" "$RESOLVER" \
  && ok "接线: resolver 内嵌解析器含 include 动词前缀剥壳" || no "resolver 内嵌解析器未同步剥壳"
grep -q '（(' "$RESOLVER" || grep -q '\[（(\]' "$RESOLVER" \
  && ok "接线: resolver 内嵌解析器含括号剥壳" || no "resolver 括号剥壳缺失"

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
