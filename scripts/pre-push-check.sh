#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Loop Engineering V4.4.1 — pre-push (1 道门: secrets 终扫)
#
# 设计原则:
#   - pre-commit 已跑 5 项物理阻断 → 不重复
#   - PostToolUse 已跑 tsc + vitest → 不重复
#   - push 唯一的独特风险: API key 泄露到 GitHub
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
echo "  Loop Engineering V4.4.1 — pre-push (worktree 隔离 + secrets)"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ═══ 门禁 1: worktree 隔离 — 禁止从 worktree 直接推 feat/prompt-architecture ═══
CURRENT_DIR=$(pwd)
if echo "$CURRENT_DIR" | grep -q "\.claude/worktrees/"; then
  # 检测 push 目标
  for arg in "$@"; do
    if echo "$arg" | grep -q "feat/prompt-architecture"; then
      echo ""
      echo "  🚫 检测到 worktree session 直接推 feat/prompt-architecture"
      echo ""
      echo "  多 worktree session 推同一分支会导致代码覆盖丢失。"
      echo "  请改推 session 分支:"
      echo ""
      SESSION_NAME=$(echo "$CURRENT_DIR" | grep -oP 'session\+?\w+' | head -1)
      echo "    git push origin HEAD:session/$SESSION_NAME"
      echo ""
      echo "  然后在 GitHub 上提 PR: session/$SESSION_NAME → feat/prompt-architecture"
      echo ""
      echo "  (如需绕过: git push origin HEAD:feat/prompt-architecture --no-verify)"
      echo ""
      exit 1
    fi
  done
fi

# ═══ 门禁 2: secrets 终扫 ═══
echo -e "${CYAN}── secrets 终扫 (最后防线) ───────────────────────────${RESET}"
bash "$SCRIPT_DIR/check-secrets.sh" || {
  echo ""
  echo -e "  ${RED}❌ secrets 扫描未通过 — 推送已拒绝${RESET}"
  echo "  API key 一旦推到 GitHub, 轮换成本极高。请修复后重试。"
  exit 1
}

echo ""
echo -e "  ${GREEN}✅ secrets 终扫通过 — 允许推送${RESET}"
echo ""
exit 0
