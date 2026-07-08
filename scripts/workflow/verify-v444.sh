#!/bin/bash
# Loop Engineering V4.4.4 — 版本同步验证器
# 用法: bash scripts/workflow/verify-v442.sh
# 退出 0 = 通过, 退出 1 = 版本未同步

set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'
FAIL=0

echo ""
echo "Loop Engineering V4.4.4 — 版本同步验证"
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
  if grep -q "V4\.4\.2\|v4\.4\.2\|4\.4\.2" "$1" 2>/dev/null; then
    echo -e "  ${GREEN}✓${RESET} $1 (V4.4.4)"
  else
    echo -e "  ${RED}✗${RESET} $1 — 版本号不是 V4.4.4"
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

echo "--- 文件存在性 (15 核心) ---"
check_file "CLAUDE.md"
check_file "scripts/pre-commit-check.sh"
check_file "scripts/check-bridge-files.sh"
check_file "scripts/pre-push-check.sh"
check_file "scripts/workflow/task-start.sh"
check_file "scripts/workflow/verify-incremental.sh"
check_file "scripts/workflow/check-brief-vs-code.sh"
check_file "scripts/workflow/loop-context.sh"
check_file "scripts/workflow/loop-score.sh"
check_file "scripts/workflow/loop-sync.sh"
check_file "scripts/workflow/post-merge-cleanup.sh"
check_file "scripts/workflow/decide-next.sh"
check_file "scripts/workflow/scope-check.sh"
check_file "scripts/hooks/post-commit.sh"
check_file "scripts/hooks/hook-enforce-loop.sh"

echo ""
echo "--- 版本号 (12 核心文件) ---"
check_version "CLAUDE.md"
check_version "scripts/pre-commit-check.sh"
check_version "scripts/check-bridge-files.sh"
check_version "scripts/check-hardcoded.sh"
check_version "scripts/pre-push-check.sh"
check_version "scripts/workflow/verify-incremental.sh"
check_version "scripts/workflow/check-brief-vs-code.sh"
check_version "scripts/workflow/loop-context.sh"
check_version "scripts/workflow/loop-score.sh"
check_version "scripts/workflow/loop-sync.sh"
check_version "scripts/workflow/post-merge-cleanup.sh"
check_version "scripts/workflow/decide-next.sh"

echo ""
echo "--- 关键内容 ---"
check_content "scripts/pre-commit-check.sh" "as any 零容忍" "as any 零容忍阻断"
check_content "scripts/pre-commit-check.sh" "engine-core" "engine-core 引用检测"
check_content "scripts/pre-commit-check.sh" "壳包" "壳包检测 (V4.4.4)"
check_content "scripts/check-bridge-files.sh" "壳包" "桥接文件壳包检测"
check_content "scripts/check-bridge-files.sh" "\.\./engine-core" "相对路径 engine-core 检测"
check_content "scripts/workflow/scope-check.sh" "V4\.4\.2" "产品对齐检查"

echo ""
echo "=========================================="
if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}${FAIL} 项失败 — 版本未完全同步${RESET}"
  echo "请运行 bash scripts/workflow/verify-v442.sh 查看详情"
  exit 1
else
  echo -e "${GREEN}全部通过 — Loop Engineering V4.4.4${RESET}"
  exit 0
fi
