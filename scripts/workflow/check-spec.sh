#!/usr/bin/env bash
# check-spec.sh — 门禁 ①: SPEC.md 强制 (硬阻断)
#
# 铁律 0-2 Step 1: Spec 先行 — 没有 spec 的代码不准进仓库。
# feat/ 分支必须包含 SPEC.md，且必须填写 4 个必填字段。
#
set -euo pipefail
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BRANCH=$(git branch --show-current 2>/dev/null || echo "main")
VIOLATIONS=0
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

# 所有分支强制 SPEC（main 除外——main 只接受 merge，不直接 commit 新代码）
if [ "$BRANCH" = "main" ]; then
  echo -e "  ${GREEN}✅ SPEC 门禁: main 分支（仅 merge），跳过${NC}"
  exit 0
fi

# 查找 SPEC.md（分支根目录、docs/specs/、当前工作目录）
SPEC_FILE=""
for candidate in \
  "$REPO_ROOT/SPEC.md" \
  "$REPO_ROOT/docs/specs/${BRANCH//\//-}.md" \
  "$REPO_ROOT/.claude/specs/${BRANCH//\//-}.md"; do
  if [ -f "$candidate" ]; then
    SPEC_FILE="$candidate"
    break
  fi
done

if [ -z "$SPEC_FILE" ]; then
  echo -e "  ${RED}❌ SPEC 门禁: 分支 ${BRANCH} 缺少 SPEC.md${NC}"
  echo ""
  echo "  Anthropic 铁律 0-2 Step 1: 写代码前先写 spec。"
  echo "  在分支根目录创建 SPEC.md，至少包含 4 个字段："
  echo ""
  echo "  # SPEC: <模块名>"
  echo "  ## 全局定位"
  echo "  - 本模块属于 [L1/L2/L3/L4/L5] 层"
  echo "  - 服务于 [哪个用户旅程]"
  echo "  - 对接 [哪个专家/测量器]"
  echo "  ## 接口签名"
  echo "  ## 接入点（本模块被谁 import？）"
  echo "  ## 算法选择"
  echo "  ## 边界条件"
  echo ""
  echo "  模板: scripts/workflow/SPEC-TEMPLATE.md"
  exit 1
fi

# 检查必填字段
REQUIRED=("全局定位" "接口签名" "接入点" "边界条件")
for field in "${REQUIRED[@]}"; do
  if ! grep -q "## $field" "$SPEC_FILE" 2>/dev/null; then
    echo -e "  ${RED}❌ SPEC 门禁: ${SPEC_FILE} 缺少必填字段 '## ${field}'${NC}"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
done

# 检查"全局定位"是否包含架构层级
if grep -q "## 全局定位" "$SPEC_FILE" 2>/dev/null; then
  if ! grep -A5 "## 全局定位" "$SPEC_FILE" | grep -qi "L[1-5]"; then
    echo -e "  ${YELLOW}⚠️  SPEC: 全局定位中未提及架构层级 (L1-L5)${NC}"
    echo "     建议标注本模块属于哪一层"
  fi
fi

echo ""

if [ "$VIOLATIONS" -gt 0 ]; then
  echo -e "${RED}SPEC 门禁: ${VIOLATIONS} 项必填字段缺失 — 提交已拒绝${NC}"
  exit 1
else
  echo -e "  ${GREEN}✅ SPEC 门禁: ${SPEC_FILE} 检查通过${NC}"
  exit 0
fi
