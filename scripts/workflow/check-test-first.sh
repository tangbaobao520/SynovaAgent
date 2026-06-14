#!/usr/bin/env bash
# check-test-first.sh — 门禁 ②: 测试先行 (硬阻断)
#
# 铁律 0-2 Step 2: 先写测试。每个 public 函数 ≥ 1 个用例。
# 硬阻断：缺少测试的 export 拒绝提交。
#
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'
MISSING=0

# 获取暂存的新增函数
STAGED_NEW=$(git diff --cached --name-only --diff-filter=A 2>/dev/null | grep '\.ts$' | grep -v '.test.' | grep -v '.d.ts' | grep -v 'node_modules' || true)

if [ -z "$STAGED_NEW" ]; then
  echo -e "  ${GREEN}✅ 测试先行: 无新增生产文件${NC}"
  exit 0
fi

while IFS= read -r file; do
  [ -z "$file" ] && continue
  full="$REPO_ROOT/$file"
  [ ! -f "$full" ] && continue

  # 查找文件中的 export function/class
  EXPORTS=$(grep -oP 'export (function|class) \K\w+' "$full" 2>/dev/null || true)
  for name in $EXPORTS; do
    [ -z "$name" ] && continue
    if echo "$name" | grep -qi 'mock\|fake\|_deprecated\|_internal'; then continue; fi

    # 搜索测试文件中的引用
    TEST_REFS=$(grep -rl "$name" "$REPO_ROOT/tests/" --include="*.test.ts" --include="*.integration.test.ts" 2>/dev/null | wc -l || echo 0)

    if [ "$TEST_REFS" -eq 0 ]; then
      echo -e "  ${YELLOW}⚠️  测试先行: ${file} 中的 export ${name} 在测试文件中零引用${NC}"
      echo "     铁律 0-2 Step 2: 每个 public 函数 ≥ 1 个测试用例"
      echo "     铁律 0-2 Step 2: 每个 public 函数 ≥ 1 个测试用例 — 硬阻断"
      MISSING=$((MISSING + 1))
    fi
  done
done <<< "$STAGED_NEW"

echo ""
if [ "$MISSING" -gt 0 ]; then
  echo -e "  ${RED}❌ 测试先行: ${MISSING} 个函数缺少测试 — 提交已拒绝${RESET}"
  echo "     铁律 0-2 Step 2: 每个 public 函数 ≥ 1 个测试用例"
  echo "     先写测试文件，再提交生产代码。"
  exit 1
else
  echo -e "  ${GREEN}✅ 测试先行: 全部通过${NC}"
  exit 0
fi
