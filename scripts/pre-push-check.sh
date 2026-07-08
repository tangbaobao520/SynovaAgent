#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Loop Engineering V4.4.4 — pre-push (secrets 终扫 + vitest --changed)
#
# 设计原则:
#   - pre-commit 已跑 8 组物理阻断 + 格式检查 → 不重复 (V4.4.4: 不再执行 verify 命令)
#   - PostToolUse 已跑 tsc --incremental + vitest --related → 不重复
#   - push 的独特风险: API key 泄露到 GitHub + 全量回归遗漏
#   - V4.4.4 新增: vitest --changed 作为 push 时的增量回归检查
#   - secrets 终扫是最后防线 — 一旦 key 推到 GitHub, 轮换成本极高
#
# 删除的 5 道门去哪了:
#   决策树 → task-start.sh Q1 已覆盖
#   tsc → PostToolUse verify-incremental.sh 已跑
#   vitest → PostToolUse verify-incremental.sh 已跑
#   铁律/接线/架构 → agent 自检 + pre-commit 5 项已覆盖
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; RESET='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Loop Engineering V4.4.4 — pre-push (secrets 终扫 + vitest --changed)"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ═══ 门禁 1: secrets 终扫 ═══
echo -e "${CYAN}── secrets 终扫 (最后防线) ───────────────────────────${RESET}"
bash "$SCRIPT_DIR/check-secrets.sh" || {
  echo ""
  echo -e "  ${RED}❌ secrets 扫描未通过 — 推送已拒绝${RESET}"
  echo "  API key 一旦推到 GitHub, 轮换成本极高。请修复后重试。"
  exit 1
}

# ═══ 门禁 2: vitest --changed (增量回归, V4.4.4 新增) ═══
echo ""
echo -e "${CYAN}── vitest --changed (增量回归) ────────────────────────${RESET}"
if ! npx vitest run --changed 2>&1 | tail -3; then
  VITEST_RESULT=$?
  # 如果 vitest --changed 返回错误, 再跑一次看具体失败
  echo ""
  echo -e "  ${YELLOW}⚠️  vitest --changed 有失败 — 请检查后重试推送${RESET}"
  npx vitest run --changed --reporter=verbose 2>&1 | grep "FAIL " | head -5
  echo ""
  echo -e "  ${RED}❌ vitest 增量回归未通过 — 推送已拒绝 (V4.4.4)${RESET}"
  echo "  修复测试失败后重试, 或在紧急情况下使用 --no-verify 绕过。"
  exit 1
fi

echo ""
echo -e "  ${GREEN}✅ 全部门禁通过 — 允许推送${RESET}"
echo ""
