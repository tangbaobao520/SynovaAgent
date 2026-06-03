#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# 铁律 34 Step 7: Conventional Commits 格式强制
# 用法: bash scripts/commit-msg-check.sh <commit-msg-file>
# 格式: type(scope): subject
# type: feat|fix|chore|docs|test|refactor|perf|style|ci|build
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

COMMIT_MSG=$(cat "$1" 2>/dev/null || echo "")
RED='\033[0;31m'; GREEN='\033[0;32m'; RESET='\033[0m'

# 跳过 merge commit / revert
if echo "$COMMIT_MSG" | grep -qE '^Merge |^Revert '; then
  exit 0
fi

# 格式检查: type(scope): subject
PATTERN='^(feat|fix|chore|docs|test|refactor|perf|style|ci|build)(\([a-z0-9_-]+\))?: .{1,140}$'

# 用 LC_ALL=C 确保 grep 字节级精确匹配（避免 UTF-8 多字节字符干扰）
if echo "$COMMIT_MSG" | head -1 | LC_ALL=C grep -qE "$PATTERN"; then
  echo -e "${GREEN}✅ Commit 格式正确${RESET}"
  exit 0
fi

echo ""
echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${RED}║  ❌ Commit 格式不符合 Conventional Commits                  ║${RESET}"
echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo "  正确格式: type(scope): subject"
echo ""
echo "  type:  feat     — 新功能"
echo "         fix      — Bug 修复"
echo "         chore    — 杂项 (依赖更新、脚本、配置)"
echo "         docs     — 文档"
echo "         test     — 测试"
echo "         refactor — 重构"
echo "         perf     — 性能优化"
echo ""
echo "  示例:"
echo "    feat(auth): 添加 Token 认证中间件 (P0-02)"
echo "    fix(tests): 修复 QualityFirewall 3 个测试失败"
echo "    chore: 添加 pre-commit 铁律自动化门禁"
echo ""
echo "  你当前的 commit 消息:"
echo "    ${COMMIT_MSG}"
echo ""
exit 1
