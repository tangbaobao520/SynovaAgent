#!/bin/bash
# Loop Engineering V4.4.5 — 版本同步验证器 (v440 兼容版)
# 用法: bash scripts/workflow/verify-v440.sh
# 退出 0 = 通过, 退出 1 = 版本未同步

set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'
FAIL=0

echo ""
echo "Loop Engineering V4.4.5 — 版本同步验证"
echo ""

# 文件存在性检查
check_file() {
  if [ -f "$1" ]; then
    echo -e "  ${GREEN}✓${RESET} $1"
  else
    echo -e "  ${RED}✗${RESET} $1 — 缺失"
    FAIL=1
  fi
}

# 版本号检查
check_version() {
  if grep -q "V4\.4\.5\|v4\.4\.5\|4\.4\.5" "$1" 2>/dev/null; then
    echo -e "  ${GREEN}✓${RESET} $1 (V4.4.5)"
  else
    echo -e "  ${RED}✗${RESET} $1 — 版本号不是 V4.4.5"
    FAIL=1
  fi
}

# 内容检查
check_content() {
  if grep -q "$2" "$1" 2>/dev/null; then
    echo -e "  ${GREEN}✓${RESET} $1 ($3)"
  else
    echo -e "  ${RED}✗${RESET} $1 — 缺少: $3"
    FAIL=1
  fi
}

echo "--- 文件存在性 (14 项) ---"
check_file "AGENTS.md"
check_file "CLAUDE.md"
check_file "LOOP.md"
check_file "loop-run-log.md"
check_file "LOOP-ENGINEERING-CHANGELOG.md"
check_file "scripts/pre-commit-check.sh"
check_file "scripts/workflow/task-start.sh"
check_file "scripts/workflow/verify-incremental.sh"
check_file "scripts/workflow/check-brief-vs-code.sh"
check_file "scripts/workflow/loop-context.sh"
check_file "scripts/workflow/loop-score.sh"
check_file "scripts/workflow/loop-sync.sh"
check_file "scripts/workflow/post-merge-cleanup.sh"
check_file ".github/workflows/ci.yml"

echo ""
echo "--- 版本号 (10 项) ---"
check_version "AGENTS.md"
check_version "CLAUDE.md"
check_version "scripts/pre-commit-check.sh"
check_version "scripts/workflow/task-start.sh"
check_version "scripts/workflow/verify-incremental.sh"
check_version "scripts/workflow/check-brief-vs-code.sh"
check_version "scripts/workflow/loop-context.sh"
check_version "scripts/workflow/loop-score.sh"
check_version "scripts/workflow/loop-sync.sh"
check_version "scripts/workflow/post-merge-cleanup.sh"

echo ""
echo "--- 关键内容 ---"
check_content "scripts/pre-commit-check.sh" "SKIP_AS_ANY" "SKIP_AS_ANY 环境变量"
check_content "scripts/pre-commit-check.sh" "SKIP_EMPTY_CATCH" "SKIP_EMPTY_CATCH 环境变量"
check_content "scripts/pre-commit-check.sh" "check-brief-vs-code.sh" "check-brief-vs-code 引用"
check_content ".github/workflows/ci.yml" "SKIP_AS_ANY" "CI SKIP_AS_ANY"
check_content ".github/workflows/ci.yml" "SKIP_EMPTY_CATCH" "CI SKIP_EMPTY_CATCH"
check_content ".github/workflows/ci.yml" "check-brief-vs-code.sh --strict" "CI check-brief-vs-code --strict"
check_content "scripts/workflow/task-start.sh" "check-brief-vs-code" "task-start 提示 check-brief-vs-code"

echo ""
echo "=========================================="
if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}${FAIL} 项失败 — 版本未完全同步${RESET}"
  echo "请从 feat/prompt-architecture 同步:"
  echo "  git checkout feat/prompt-architecture -- AGENTS.md CLAUDE.md LOOP.md loop-run-log.md LOOP-ENGINEERING-CHANGELOG.md scripts/ .github/workflows/ci.yml"
  exit 1
else
  echo -e "${GREEN}全部通过 — Loop Engineering V4.4.5${RESET}"
  exit 0
fi
