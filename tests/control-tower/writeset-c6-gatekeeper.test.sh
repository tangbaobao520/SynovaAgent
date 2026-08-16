#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# writeset-c6-gatekeeper.test.sh — D381 写集表 fail-open 修复测试
#
# 背景: maker 第一版 dev doc 无写集表, check-dev-doc-write-set.sh SKIP+exit 0
#       (fail-open, M1 活实例)。D381 修复两层:
#       a) devdoc_writeset.py 容忍写集表标题后空行 (解析器脆弱性)
#       b) dev-doc-gatekeeper.sh 新增 C6 — 写集表提取失败 = FAIL (阻断)
#
# 覆盖 (铁律 48: 正常/降级/边界):
#   1. 标题后带空行 → --extract ok (P0-2 修复点)
#   2. 标题后无空行 → --extract ok (回归)
#   3. gatekeeper 有写集表 (且满足 C1-C5) → C6 PASS
#   4. gatekeeper 无写集表 → C6 FAIL + exit 1 (fail-open 修复)
#   5. 写集表空表 (仅表头无数据行) → 提取失败 → C6 FAIL (边界)
#
# 零真实仓库依赖: 样例 doc 用 /tmp, 文件路径声明用真实存在的 src/ 文件。
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
WS_TOOL="$REPO_DIR/scripts/control-tower/devdoc_writeset.py"
GATEKEEPER="$REPO_DIR/scripts/control-tower/dev-doc-gatekeeper.sh"
TMP_DIR="/tmp/d381-tests"

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_contains() { if echo "$1" | grep -qF "$2"; then pass "$3"; else fail "$3 — 未找到: $2"; fi; }
assert_not_contains() { if echo "$1" | grep -qF "$2"; then fail "$3 — 不应包含: $2"; else pass "$3"; fi; }

mkdir -p "$TMP_DIR"
rm -f "$TMP_DIR"/c6-*.md 2>/dev/null || true

echo "═══════════════════════════════════════════════════════════"
echo "  D381 写集表 fail-open 修复测试"
echo "═══════════════════════════════════════════════════════════"
echo ""

# 满足 C1-C5 的最小 dev doc 骨架 (C6 是唯一变量)
BODY='## Test Requirements
- L1: 单元测试
- L2a: 集成测试

## Wiring Verification
调用方: src/sentinel/sentinel-loader.ts (生产调用点)

## Authority Doc Verification
来源: docs/synova/research/SYNOVA-DESIGN-产品完成度仪表盘-v1-20260816.md
'

echo "── 1. 标题后带空行 → --extract ok (P0-2 修复点) ──"
printf '# Test\n\n### 3.1 写集 (1 修改)\n\n| 文件 | 操作 |\n|------|:---:|\n| src/sentinel/types.ts | 修改 |\n\n%s' "$BODY" > "$TMP_DIR/c6-blank.md"
OUT=$(python3 "$WS_TOOL" --extract "$TMP_DIR/c6-blank.md" 2>&1)
assert_contains "$OUT" '"status": "ok"' "空行后提取成功"
assert_contains "$OUT" 'src/sentinel/types.ts' "提取到条目"
echo ""

echo "── 2. 标题后无空行 → --extract ok (回归) ──"
printf '# Test\n\n### 3.1 写集 (1 修改)\n| 文件 | 操作 |\n|------|:---:|\n| src/sentinel/types.ts | 修改 |\n\n%s' "$BODY" > "$TMP_DIR/c6-noblank.md"
OUT=$(python3 "$WS_TOOL" --extract "$TMP_DIR/c6-noblank.md" 2>&1)
assert_contains "$OUT" '"status": "ok"' "无空行提取成功 (回归)"
echo ""

echo "── 3. gatekeeper 有写集表 → C6 PASS ──"
GEXIT=0
GOUT=$(bash "$GATEKEEPER" "$TMP_DIR/c6-blank.md" 2>&1) || GEXIT=$?
assert_contains "$GOUT" "C6: 写集表存在" "C6 PASS 字样"
echo ""

echo "── 4. gatekeeper 无写集表 → C6 FAIL + exit 1 (fail-open 修复) ──"
printf '# Test\n\n## 其他章节\n正文内容\n\n%s' "$BODY" > "$TMP_DIR/c6-nosheet.md"
GEXIT=0
GOUT=$(bash "$GATEKEEPER" "$TMP_DIR/c6-nosheet.md" 2>&1) || GEXIT=$?
assert_contains "$GOUT" "C6: 写集表缺失或格式错误" "C6 FAIL 字样"
assert_not_contains "$GOUT" "ALL PASS" "不得 ALL PASS"
if [ "$GEXIT" -eq 1 ]; then pass "exit=1 (阻断)"; else fail "期望 exit=1 实际=$GEXIT"; fi
echo ""

echo "── 5. 写集表空表 (仅表头) → 提取失败 → C6 FAIL (边界) ──"
printf '# Test\n\n### 3.1 写集 (0 修改)\n| 文件 | 操作 |\n|------|:---:|\n\n%s' "$BODY" > "$TMP_DIR/c6-empty.md"
OUT=$(python3 "$WS_TOOL" --extract "$TMP_DIR/c6-empty.md" 2>&1)
assert_contains "$OUT" '"status": "skip"' "空表提取 skip"
assert_contains "$OUT" '无写集表' "skip 原因明确"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  结果: PASS=$PASS FAIL=$FAIL"
echo "═══════════════════════════════════════════════════════════"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
