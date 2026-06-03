#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# 铁律 0-2 Step 4+5: pre-push 硬阻断
# tsc --noEmit → vitest run → iron-laws check
# 任一失败 → 拒绝 push, 强制本地修复
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Pre-Push 门禁 (Iron Law 0-2 Step 4+5+6)"
echo "═══════════════════════════════════════════════════════════"
echo ""

FAIL=0

# Step 4a: TypeScript 编译检查 (只检查 src/ 层级, 排除 vendor + packages)
echo -n "  tsc --noEmit ... "
TSC_OUT=$(npx tsc --noEmit 2>&1 || true)
# 精准排除: vendor engine-core + packages (这些包独立有自己的 tsc/CI)
TSC_OWN=$(echo "$TSC_OUT" | grep "error TS" | grep -v "server/vendor/" | grep -v "packages/" || true)
TSC_OWN_COUNT=$(echo "$TSC_OWN" | grep -c "error TS" 2>/dev/null || echo 0)
TSC_VENDOR_COUNT=$(echo "$TSC_OUT" | grep "server/vendor/" | grep -c "error TS" 2>/dev/null || echo 0)
TSC_PKG_COUNT=$(echo "$TSC_OUT" | grep "packages/" | grep -c "error TS" 2>/dev/null || echo 0)
if [ "${TSC_OWN_COUNT:-0}" -gt 0 ]; then
  echo -e "${RED}❌ ${TSC_OWN_COUNT} src/ errors — 修复后重试 push${RESET}"
  echo "$TSC_OWN" | head -10
  FAIL=1
elif [ "${TSC_VENDOR_COUNT:-0}" -gt 0 ] || [ "${TSC_PKG_COUNT:-0}" -gt 0 ]; then
  echo -e "${GREEN}✅ src/ 零错误${RESET} ${YELLOW}(vendor: ${TSC_VENDOR_COUNT}, packages: ${TSC_PKG_COUNT} — 各自独立门禁)${RESET}"
else
  echo -e "${GREEN}✅${RESET}"
fi

# Step 4b: 全量测试 — Anthropic 标准: 零测试失败才允许 push
echo -n "  vitest run ... "
# Exclude integration tests that need Python/spawn — they don't work in hook context
VITEST_OUTPUT=$(npx vitest run --reporter=verbose --exclude='tests/integration/**' 2>&1 || true)
FAILED_TESTS=$(echo "$VITEST_OUTPUT" | grep -c "× " 2>/dev/null || echo 0)
PASSED_TESTS=$(echo "$VITEST_OUTPUT" | grep -c "✓ " 2>/dev/null || echo 0)
FAILED_TESTS=$(echo "$FAILED_TESTS" | tr -d '[:space:]')
PASSED_TESTS=$(echo "$PASSED_TESTS" | tr -d '[:space:]')
if [ "${FAILED_TESTS:-0}" -eq 0 ] && [ "${PASSED_TESTS:-0}" -gt 0 ]; then
  echo -e "${GREEN}✅ ${PASSED_TESTS} passed, 0 failed${RESET}"
else
  echo -e "${RED}❌ ${FAILED_TESTS} failed, ${PASSED_TESTS} passed — 零失败才允许 push${RESET}"
  FAIL=1
fi

# Step 5+6: 铁律检查 (as any, Mock, CJS require, .only, console, .env)
echo -n "  iron-laws check ... "
if bash "$SCRIPT_DIR/pre-commit-check.sh" 2>/dev/null; then
  echo -e "${GREEN}✅${RESET}"
else
  echo -e "${RED}❌ 铁律违规 — 修复后重试 push${RESET}"
  FAIL=1
fi

# npm audit: critical vulnerabilities → warning (network-dependent)
echo -n "  npm audit ... "
AUDIT=$(npm audit --json 2>/dev/null || echo '{"error":"audit failed"}')
CRIT=$(echo "$AUDIT" | grep -o '"critical":[0-9]*' | grep -o '[0-9]*' | head -1 || echo "0")
if [ "${CRIT:-0}" -gt 0 ] 2>/dev/null; then
  echo -e "${YELLOW}⚠ ${CRIT} critical (不阻断, 请及时修复)${RESET}"
elif echo "$AUDIT" | grep -q '"error"'; then
  echo -e "${YELLOW}⚠ audit unavailable (network)${RESET}"
else
  echo -e "${GREEN}✅${RESET}"
fi

echo ""
echo "───────────────────────────────────────────────────────────"
if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}Pre-Push 全部通过 ✅ — 允许推送${RESET}"
  echo ""
  exit 0
else
  echo -e "  ${RED}Pre-Push 失败 — 推送已拒绝${RESET}"
  echo ""
  echo "  铁律 0-2 要求: spec → test → impl → wire → review → merge"
  echo "  Push 前必须: tsc 零错误 + vitest 全绿 + iron laws 通过"
  echo ""
  exit 1
fi
