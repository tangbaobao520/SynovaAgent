#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# golden-case-break-test.sh — D300 破坏态回归测试 (A线 C-G1)
#
# 验证 golden-case-checker.ts 的 F1 门禁真实有效（不是恒绿的空壳）:
#   1. 备份 golden-case-01 fixture
#   2. 篡改 expected.matchedEdgeIds（注入不存在边）→ checker 必须 exit 1
#   3. trap 还原 fixture → checker 必须 exit 0（还原生效）
#   4. 夹具缺失/损坏 → 测试本身失败（防误删）
#
# 用法: bash tests/ci/golden-case-break-test.sh
# 退出码: 0 = 全部通过, 1 = 门禁未拦截或还原失败
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
FIXTURE_DIR="$REPO_DIR/tests/fixtures/golden-cases"
FIXTURE="$FIXTURE_DIR/golden-case-01-cashflow-crisis.json"
BACKUP="$FIXTURE_DIR/.golden-case-01-tampered.backup.json"
CHECKER="$REPO_DIR/scripts/ci/golden-case-checker.ts"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }

# ── 前置: 夹具必须存在 (防误删 — 夹具损坏即测试失败) ──
if [ ! -f "$FIXTURE" ]; then
  echo "❌ 黄金案例夹具缺失: $FIXTURE — 测试中止 (夹具可能被误删)"
  exit 1
fi

# ── trap 还原: 任何退出路径都必须还原 fixture ──
restore_fixture() {
  if [ -f "$BACKUP" ]; then
    cp "$BACKUP" "$FIXTURE"
    rm -f "$BACKUP"
  fi
}
trap restore_fixture EXIT

echo "═══════════════════════════════════════════════════════════"
echo "  D300 Golden Case Break Test — 破坏态回归"
echo "  fixture: golden-case-01-cashflow-crisis.json"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── Step 1: 备份 + 篡改 (注入不存在的边 → F1 必不过) ──
echo "── Step 1: 篡改 fixture (注入 E-99-TAMPERED 到 expected.matchedEdgeIds) ──"
cp "$FIXTURE" "$BACKUP"
node -e "
const fs = require('fs');
const p = process.argv[1];
const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
if (!d.expected || !Array.isArray(d.expected.matchedEdgeIds)) {
  console.error('fixture 结构异常: expected.matchedEdgeIds 缺失');
  process.exit(1);
}
d.expected.matchedEdgeIds.push('E-99-TAMPERED');
fs.writeFileSync(p, JSON.stringify(d, null, 2));
" "$FIXTURE"
if node -e "
const d = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf-8'));
process.exit(d.expected.matchedEdgeIds.includes('E-99-TAMPERED') ? 0 : 1);
" "$FIXTURE"; then
  pass "篡改成功 — E-99-TAMPERED 已注入"
else
  fail "篡改失败 — fixture 未被修改"
  exit 1
fi

# ── Step 2: 断言 F1 门禁拦截 (篡改后必须 exit 1) ──
echo ""
echo "── Step 2: F1 门禁拦截断言 ──"
if npx tsx "$CHECKER" > /dev/null 2>&1; then
  fail "篡改后 checker 仍 exit 0 — F1 门禁未拦截, 无声退化防护失效"
else
  pass "篡改后 checker exit 1 — F1 门禁正确拦截"
fi

# ── Step 3: 还原后必须恢复 exit 0 ──
echo ""
echo "── Step 3: trap 还原 + 恢复断言 ──"
restore_fixture
if [ -f "$BACKUP" ]; then
  fail "还原失败 — 备份文件仍存在"
elif npx tsx "$CHECKER" > /dev/null 2>&1; then
  pass "还原后 checker exit 0 — trap 还原生效"
else
  fail "还原后 checker 仍 exit 1 — 还原未生效"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  结果: $PASS 通过, $FAIL 失败"
if [ "$FAIL" -gt 0 ]; then
  echo "  Status: ❌ 破坏态回归未通过"
  echo "═══════════════════════════════════════════════════════════"
  exit 1
fi
echo "  Status: ✅ 破坏态回归全部通过"
echo "═══════════════════════════════════════════════════════════"
exit 0
