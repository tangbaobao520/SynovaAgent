#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Loop Engineering V4.2.6 — check-acceptance-ci.sh
# 能力验收测试 CI 守卫。pre-commit 第 8 组调用。全部 <1s。
#
# Anthropic 原则 2: 先设计验证标准。验收测试存在于文件系统 ≠ 验证通过。
# 必须证明测试曾经运行并通过过——CI 结果文件是物理证据。
# ═══════════════════════════════════════════════════════════════════════════════
set +e

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'

ACCEPTANCE_DIR="$ROOT/tests/acceptance"
CI_RESULTS="$ROOT/.claude/acceptance-ci-results.json"

# 无验收测试目录 → 跳过
if [ ! -d "$ACCEPTANCE_DIR" ]; then
  echo -e "  ${GREEN}✅ 能力验收 CI (无 acceptance 目录)${RESET}"
  exit 0
fi

# 无测试文件 → 跳过
TEST_COUNT=$(find "$ACCEPTANCE_DIR" -name "*.test.ts" 2>/dev/null | wc -l)
if [ "${TEST_COUNT:-0}" -eq 0 ]; then
  echo -e "  ${GREEN}✅ 能力验收 CI (无测试文件)${RESET}"
  exit 0
fi

# 有测试文件但无 CI 结果 → 阻断
if [ ! -f "$CI_RESULTS" ]; then
  echo -e "  ${RED}❌ 能力验收 CI: ${TEST_COUNT} 个验收测试但从未在 CI 运行  [硬阻断]${RESET}"
  echo "    tests/acceptance/ 下的测试必须在 CI 中至少运行并通过过一次。"
  echo "    请在 CI pipeline 中添加: npx vitest run tests/acceptance/ --reporter=json > .claude/acceptance-ci-results.json"
  exit 1
fi

# 检查 CI 结果
FAILED=$(python3 -c "
import json,sys
try:
  data = json.load(open('$CI_RESULTS'))
  failed = data.get('numFailedTests', 0)
  print(failed)
except: print(-1)
" 2>/dev/null)

if [ "${FAILED:-0}" = "-1" ]; then
  echo -e "  ${RED}❌ 能力验收 CI: 结果文件损坏  [硬阻断]${RESET}"
  exit 1
fi

if [ "${FAILED:-0}" -gt 0 ]; then
  echo -e "  ${RED}❌ 能力验收 CI: ${FAILED} 个测试失败  [硬阻断]${RESET}"
  echo "    验收测试未通过。请修复后重新运行 CI。"
  exit 1
fi

echo -e "  ${GREEN}✅ 能力验收 CI (${TEST_COUNT} 测试, 全部通过)${RESET}"
exit 0
