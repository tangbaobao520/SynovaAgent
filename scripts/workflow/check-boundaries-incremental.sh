#!/bin/bash
# check-boundaries-incremental.sh — 增量架构边界检查
# 只检查本次 git diff 中的 .ts 文件是否有跨层引用
# exit 0 = 无违规, exit 1 = 发现跨层引用
set -euo pipefail
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"
RED='\033[0;31m'; GREEN='\033[0;32m'; RESET='\033[0m'

CHANGED_FILES=$(git diff --name-only 2>/dev/null | grep '^src/.*\.ts$' | grep -v '\.test\.' | grep -v '\.d\.ts' || true)
if [ -z "$CHANGED_FILES" ]; then
  exit 0
fi

VIOLATIONS=0

while IFS= read -r file; do
  [ -z "$file" ] && continue
  [ ! -f "$file" ] && continue

  # 读文件内容，只检查 import 行
  IMPORTS=$(grep "^import\|from" "$file" 2>/dev/null | grep -v "import type" || true)
  if [ -z "$IMPORTS" ]; then continue; fi

  case "$file" in
    src/routes/*|src/tui/*|src/l1*/*)
      # L1 禁止导入 L3/L4/L5
      if echo "$IMPORTS" | grep -qE "from '\.\./(l3|l4|l5)/|from '\.\./store/|from '\.\./sentinel/" 2>/dev/null; then
        MATCH=$(echo "$IMPORTS" | grep -E "from '\.\./(l3|l4|l5)/|from '\.\./store/|from '\.\./sentinel/")
        echo -e "${RED}[L1→L3/L4/L5] $file 跨层引用:${RESET}"
        echo "  $MATCH"
        VIOLATIONS=$((VIOLATIONS + 1))
      fi
      ;;

    src/agent/*|src/orchestrator/*|src/l2*/*)
      # L2 禁止导入 L4/L5 (豁免桥接服务)
      if echo "$file" | grep -qE "bridge-service|knowledge-bridge|review-service|sentinel-health-service|sentinel-service"; then
        continue
      fi
      if echo "$IMPORTS" | grep -qE "from '\.\./(l4|l5)/|from '\.\./store/" 2>/dev/null; then
        MATCH=$(echo "$IMPORTS" | grep -E "from '\.\./(l4|l5)/|from '\.\./store/")
        echo -e "${RED}[L2→L4/L5] $file 跨层引用:${RESET}"
        echo "  $MATCH"
        VIOLATIONS=$((VIOLATIONS + 1))
      fi
      ;;

    src/l3/*|src/sentinel/*)
      # L3 禁止导入 L1/L5
      if echo "$IMPORTS" | grep -qE "from '\.\./routes/|from '\.\./store/" 2>/dev/null; then
        MATCH=$(echo "$IMPORTS" | grep -E "from '\.\./routes/|from '\.\./store/")
        echo -e "${RED}[L3→L1/L5] $file 跨层引用:${RESET}"
        echo "  $MATCH"
        VIOLATIONS=$((VIOLATIONS + 1))
      fi
      ;;
  esac
done <<< "$CHANGED_FILES"

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "发现 ${VIOLATIONS} 处跨层引用。请重构为 L2 桥接服务。"
  exit 1
fi

exit 0
