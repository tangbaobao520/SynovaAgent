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

# Step 4a: TypeScript 编译检查 (核心代码, 已知 TUI/tools/vendor 有存量, 不计入阻断)
echo -n "  tsc --noEmit (core) ... "
# 只检查我们维护的核心目录。TUI(blessed无类型)/tools(stub)/vendor(独立包)在有type error时不计入阻断
TSC_OUT=$(npx tsc --noEmit 2>&1 || true)
CORE_ERRS=$(echo "$TSC_OUT" | grep -E "^src/(agent|l2-interfaces|l3|l4|orchestrator|providers|routes|store|evidence|errors|security|services|cron|connectors|adapters|ingest|evolution|expert-platform|extensions|init|mcp|config|logger|server|index)\.ts" | grep -v "node_modules" | wc -l | tr -d '[:space:]')
CORE_ERRS="${CORE_ERRS:-0}"
if [ "$CORE_ERRS" -eq 0 ]; then
  echo -e "${GREEN}✅${RESET}"
else
  echo -e "${RED}❌ ${CORE_ERRS} core errors${RESET} (TUI/tools/vendor excluded)"
  echo "$TSC_OUT" | grep -E "^src/(agent|l2|l3|l4|orchestrator|providers|routes|store|evidence|errors|security|services|cron|connectors|adapters|ingest|evolution|expert-platform|extensions|init|mcp|config|logger|server|index)" | head -10
  FAIL=1
fi

# Step 4b: 全量测试 — Anthropic 标准: 零失败才允许 push
echo -n "  vitest run ... "
VITEST_OUTPUT=$(npx vitest run --reporter=dot 2>&1)
FAILED_COUNT=$(echo "$VITEST_OUTPUT" | grep -oP '\d+(?= failed)' | head -1 || echo "0")
PASSED_COUNT=$(echo "$VITEST_OUTPUT" | grep -oP '\d+(?= passed)' | head -1 || echo "0")
if [ "${FAILED_COUNT:-0}" -eq 0 ] && [ "${PASSED_COUNT:-0}" -gt 0 ]; then
  echo -e "${GREEN}✅ ${PASSED_COUNT} passed, 0 failed${RESET}"
else
  echo -e "${RED}❌ ${FAILED_COUNT:-?} failed, ${PASSED_COUNT:-?} passed — 零失败才允许 push${RESET}"
  echo "     Anthropic 标准: CI 零失败合并。修复后重试。"
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

# npm audit: critical vulnerabilities → block push
echo -n "  npm audit ... "
AUDIT=$(npm audit --json 2>/dev/null || echo '{"error":"audit failed"}')
if echo "$AUDIT" | grep -q '"critical"'; then
  CRIT=$(echo "$AUDIT" | grep -o '"critical":[0-9]*' | grep -o '[0-9]*' | head -1)
  echo -e "${RED}❌ ${CRIT} critical vulnerabilities${RESET}"
  FAIL=1
elif echo "$AUDIT" | grep -q '"error"'; then
  echo -e "${YELLOW}⚠ audit unavailable${RESET}"
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
