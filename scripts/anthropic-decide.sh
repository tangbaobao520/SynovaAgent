#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Anthropic 决策树 — 每次 commit 自动运行
# 不检查规则，而是回答问题："Anthropic 团队现在会做什么？"
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; RESET='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${CYAN}  Anthropic 工程决策树 — 现在应该做什么？${RESET}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

PRIORITY=()

# ═══ Question 1: Does it work? ═══
TEST_OUTPUT=$(cd "$ROOT" && npx vitest run --reporter=verbose 2>&1 || true)
FAILED=$(echo "$TEST_OUTPUT" | grep -c "× " 2>/dev/null | tr -d '[:space:]' || echo "0")
PASSED=$(echo "$TEST_OUTPUT" | grep -c "✓ " 2>/dev/null | tr -d '[:space:]' || echo "0")

if [ "${FAILED:-0}" -gt 0 ]; then
  echo -e "  ${RED}Q1: Does it work? → NO (${FAILED} tests failing)${RESET}"
  echo -e "  ${RED}   → STOP. Fix the failing tests before anything else.${RESET}"
  PRIORITY+=("🔴 P0: 修复 ${FAILED} 个失败测试 → npx vitest run --reporter=verbose")
else
  echo -e "  ${GREEN}Q1: Does it work? → YES (${PASSED} tests passing)${RESET}"
fi

# ═══ Question 2: Any blocked commits? ═══
BLOCKED=""
# engine-core SOG-001
if [ -f "$ROOT/../server/vendor/@synova/engine-core/src/pipeline/diagnosis/graph-store.ts" ]; then
  if grep -q "DELETE FROM graph_nodes" "$ROOT/../server/vendor/@synova/engine-core/src/pipeline/diagnosis/graph-store.ts" 2>/dev/null; then
    BLOCKED="${BLOCKED}SOG-001 "
  fi
fi

if [ -n "$BLOCKED" ]; then
  echo -e "  ${RED}Q2: Any blocked commits? → YES: ${BLOCKED}${RESET}"
  echo -e "  ${RED}   → Unblock by fixing the commit gate, then commit.${RESET}"
  PRIORITY+=("🔴 P0: Unblock ${BLOCKED}→ fix engine-core pre-commit violations → commit SOG-001")
else
  echo -e "  ${GREEN}Q2: Any blocked commits? → NO${RESET}"
fi

# ═══ Question 3: Critical bugs in vendor? ═══
# SOG-002: 多租户隔离缺失 (queryTriples 无 graph guard → 已修复 2026-06-05)
# SOG-003: 空 catch 吞异常 (llm-client.ts 熔断器 → 已修复 2026-06-05)
# SOG-004: GraphStore 接口 graph? 误导 (已添加文档注释 2026-06-05)
VENDOR_CRITICAL=0
# Check: Any remaining empty catch blocks in vendor that silently swallow errors
EMPTY_CATCHES=$(grep -rn "\.catch(() => {})" "$ROOT/../server/vendor/@synova/engine-core/src/" --include="*.ts" 2>/dev/null | grep -v "\.test\." | wc -l | tr -d '[:space:]') || true
VENDOR_CRITICAL=$((VENDOR_CRITICAL + ${EMPTY_CATCHES:-0}))
# Check: Any hard deletes (physical DELETE FROM)
HARD_DELETES=$(grep -rn "DELETE FROM" "$ROOT/../server/vendor/@synova/engine-core/src/" --include="*.ts" 2>/dev/null | grep -v "\.test\." | wc -l | tr -d '[:space:]') || true
VENDOR_CRITICAL=$((VENDOR_CRITICAL + ${HARD_DELETES:-0}))

if [ "$VENDOR_CRITICAL" -gt 0 ]; then
  echo -e "  ${YELLOW}Q3: Critical bugs in vendor? → ${VENDOR_CRITICAL} items${RESET}"
  echo -e "  ${YELLOW}     Anthropic rule: vendor bugs = product bugs. No deferring.${RESET}"
  PRIORITY+=("🟡 P1: engine-core ${VENDOR_CRITICAL} Critical/High items — start with SOG-002 (多租户)")
else
  echo -e "  ${GREEN}Q3: Critical bugs in vendor? → 0${RESET}"
fi

# ═══ Question 4: User-visible gaps? ═══
# Check if FederalReporter is instantiated/called anywhere (not just defined)
FED_DEFINED=$(grep -rn "class FederalReporter\|export class FederalReporter" "$ROOT/../server/vendor/@synova/engine-core/src/" --include="*.ts" 2>/dev/null | wc -l | tr -d '[:space:]')
FED_CALLED=$(grep -rn "new FederalReporter\|FederalReporter(" "$ROOT/src/" "$ROOT/../server/vendor/" --include="*.ts" 2>/dev/null | grep -v "federal-reporter.ts" | grep -v "\.test\." | wc -l | tr -d '[:space:]')
# Defined but never called = unwired
FED_WIRED=$FED_CALLED

if [ "${FED_WIRED:-0}" -eq 0 ]; then
  echo -e "  ${YELLOW}Q4: User-visible gaps? → YES: Federal evolution offline${RESET}"
  echo -e "  ${YELLOW}     100% code, 0% function. 差分隐私+AES+RSA 全部造好, 从未启动.${RESET}"
  PRIORITY+=("🟡 P1: FED-001 联邦进化接线 → server.ts 启动 FederalReporter → diagnosis 钩子")
else
  echo -e "  ${GREEN}Q4: User-visible gaps? → NO${RESET}"
fi

# ═══ Question 5: Silent failures? ═══
EMPTY_CATCH=$(grep -rn "catch\s*{" "$ROOT/src/" --include="*.ts" 2>/dev/null \
  | grep -v "log\." | grep -v "node_modules" | grep -v "\.test\." \
  | grep -v "/\*\|//" | grep -v "JSON.parse\|ENOENT\|_reading\|\.destroy\|\.end\|\.detach" \
  | grep -v "return '0\|keep original\|setRawMode" \
  | wc -l | tr -d '[:space:]')
EMPTY_CATCH="${EMPTY_CATCH:-0}"

if [ "${EMPTY_CATCH:-0}" -gt 0 ] 2>/dev/null; then
  echo -e "  ${YELLOW}Q5: Silent failures? → ${EMPTY_CATCH} empty catches${RESET}"
  echo -e "  ${YELLOW}     Errors swallowed without log. Degraded mode invisible.${RESET}"
  if [ "${FAILED:-0}" -eq 0 ] && [ -z "$BLOCKED" ]; then
    PRIORITY+=("🟡 P2: 补全 ${EMPTY_CATCH} 处空 catch → grep -rn 'catch\s*{' src/ | grep -v 'log\.'")
  fi
else
  echo -e "  ${GREEN}Q5: Silent failures? → 0${RESET}"
fi

# ═══ Decision ═══
echo ""
echo -e "${CYAN}──────────────────────────────────────────────────────${RESET}"
if [ ${#PRIORITY[@]} -eq 0 ]; then
  echo -e "  ${GREEN}✅ 所有检查通过。可以开始新功能开发。${RESET}"
else
  echo -e "  ${CYAN}Anthropic 优先级排序:${RESET}"
  for i in "${!PRIORITY[@]}"; do
    echo -e "  ${PRIORITY[$i]}"
  done
fi
echo -e "${CYAN}──────────────────────────────────────────────────────${RESET}"
echo ""
