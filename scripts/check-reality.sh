#!/usr/bin/env bash
# check-reality.sh — 自动化诚实门禁 (pre-commit 硬阻断)
#
# 不靠 CLAUDE.md 提醒 — 编译器级强制执行。
# 只检查 git 暂存区变更 — 存量文件通过 STATE.md 追踪，不影响 commit 速度。
#
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VIOLATIONS=0
STAGED=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep '\.ts$' || true)
RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'

if [ -z "$STAGED" ]; then
  echo -e "  ${GREEN}✅ 诚实门禁: 无 .ts 文件变更${NC}"
  exit 0
fi

while IFS= read -r file; do
  [ -z "$file" ] && continue
  full="$REPO_ROOT/$file"
  [ ! -f "$full" ] && continue
  [[ "$file" == *"node_modules"* || "$file" == *"dist"* || "$file" == *".d.ts"* || "$file" == *".test."* ]] && continue

  # Rule 1: 新文件必须有 @state 标记
  if git diff --cached --diff-filter=A "$file" 2>/dev/null | grep -q '^+'; then
    if ! grep -q '@state:' "$full"; then
      echo -e "  ${RED}❌ $file: 新文件缺少 @state: 标记${NC}"
      echo "     加一行: // @state: real | skeleton | placeholder"
      VIOLATIONS=$((VIOLATIONS + 1))
      continue
    fi
  fi

  # Rule 2: @state: real 文件不能包含 mock/fake
  if grep -q '@state:.*real' "$full"; then
    MOCK_HITS=$(grep -n "MOCK_\|TODO.*后期替换\|compute:.*() => null\|const mockLLM\|\/\/ fake\|\/\/ hardcoded" "$full" 2>/dev/null || true)
    if [ -n "$MOCK_HITS" ]; then
      echo -e "  ${RED}❌ $file: 标记 @state: real 但包含 mock/fake${NC}"
      echo "$MOCK_HITS" | head -5 | while read -r line; do echo "     $line"; done
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  fi

done <<< "$STAGED"

echo ""

if [ "$VIOLATIONS" -gt 0 ]; then
  echo -e "${RED}诚实门禁: ${VIOLATIONS} 项违规 — 提交已拒绝${NC}"
  exit 1
else
  echo -e "  ${GREEN}✅ 诚实门禁: ${STAGED_COUNT:-} 个文件检查通过${NC}"
  exit 0
fi
