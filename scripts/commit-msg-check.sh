#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Anthropic 标准: Conventional Commits + issue 引用
# 格式: type(scope): subject
# 要求: commit body 含 issue/task 引用 (#C1, P1-2, SOG-001 等)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

COMMIT_MSG=$(cat "$1" 2>/dev/null || echo "")
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'

if echo "$COMMIT_MSG" | grep -qE '^Merge |^Revert '; then exit 0; fi

PATTERN='^(feat|fix|chore|docs|test|refactor|perf|style|ci|build)(\([a-z0-9_-]+\))?: .{1,140}$'

if ! echo "$COMMIT_MSG" | head -1 | LC_ALL=C grep -qE "$PATTERN"; then
  echo ""
  echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${RED}║  ❌ Commit 格式不符合 Conventional Commits                  ║${RESET}"
  echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${RESET}"
  echo ""
  echo "  正确格式: type(scope): subject"
  echo "  type: feat | fix | chore | docs | test | refactor | perf | ci"
  echo "  示例: feat(p1-3): 接线 EvidenceManager 到诊断流程"
  echo "        fix(#C1): 修复 Phase 0 状态机流转 bug"
  echo ""
  exit 1
fi

# Anthropic 标准: 检查 issue/task 引用 (warning, not block)
if echo "$COMMIT_MSG" | grep -qE '#[A-Z]+[0-9]+|P[0-9]+-[0-9]+|[A-Z]+-[0-9]{3}|#[0-9]+'; then
  echo -e "${GREEN}✅ Commit 格式正确 + 含 issue 引用${RESET}"
else
  echo -e "${GREEN}✅ Commit 格式正确${RESET}"
  echo -e "${YELLOW}   ⚠ 建议在 commit body 中包含 issue/task 引用 (如 #C1, P1-2, SOG-001)${RESET}"
fi
exit 0
