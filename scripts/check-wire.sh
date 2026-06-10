#!/usr/bin/env bash
# check-wire.sh — 接线审计 (pre-push 硬阻断)
# 铁律 0-2 Step 5: 新函数/类名必须出现在至少一个生产入口文件中
# 在 pre-push 运行（比 pre-commit 慢，但只在 push 前跑一次）
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'

# Get list of files changed since last push (or all staged if no push yet)
CHANGED=$(git diff --name-only origin/main...HEAD 2>/dev/null | grep '\.ts$' | grep -v '.test.' | grep -v '.d.ts' || true)
if [ -z "$CHANGED" ]; then
  echo -e "  ${GREEN}✅ 接线审计: 无变更${NC}"
  exit 0
fi

VIOLATIONS=0
while IFS= read -r file; do
  [ -z "$file" ] && continue
  full="$REPO_ROOT/$file"
  [ ! -f "$full" ] && continue

  # Find new exports (added, not removed)
  NEW=$(git diff origin/main...HEAD -- "$file" 2>/dev/null | grep '^+export \(function\|class\)' | grep -oP 'export (function|class) \K\w+' || true)
  for name in $NEW; do
    [ -z "$name" ] && continue
    if echo "$name" | grep -qi 'mock\|fake\|test\|sample\|_deprecated'; then continue; fi

    # Search production code (exclude test files and the file itself)
    HITS=$(grep -rl "$name" "$REPO_ROOT/src/" "$REPO_ROOT/packages/" --include="*.ts" 2>/dev/null | grep -v '.test.' | grep -v '.spec.' | grep -v "$file" | head -3 || true)

    if [ -z "$HITS" ]; then
      echo -e "  ${RED}❌ $file: export $name — 零生产入口引用${NC}"
      echo "     如果这是内部函数，去掉 export。如果是对外接口，补充接线。"
      VIOLATIONS=$((VIOLATIONS + 1))
    else
      echo -e "  ${GREEN}✅ $file: $name → 已接线 (via $(echo "$HITS" | head -1 | sed "s|$REPO_ROOT/||"))${NC}"
    fi
  done
done <<< "$CHANGED"

echo ""
if [ "$VIOLATIONS" -gt 0 ]; then
  echo -e "${RED}接线审计: ${VIOLATIONS} 项未接线 — push 已拒绝${NC}"
  exit 1
else
  echo -e "${GREEN}接线审计: 全部通过${NC}"
  exit 0
fi
