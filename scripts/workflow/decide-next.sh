#!/usr/bin/env bash
# decide-next.sh — Loop Engineering v3.0: 每次提交后建议下一步
# post-commit 自动触发。必须瞬时完成。
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Anthropic 决策流程 — 下一步行动建议"
echo "═══════════════════════════════════════════════════════════"
echo ""

# 1. 最近完成
echo -e "${CYAN}── 1. 最近完成 ──────────────────────────────────────${NC}"
git log --oneline -5 2>/dev/null | while read -r line; do
  echo "  $line"
done
echo ""

# 2. 代码健康度
echo -e "${CYAN}── 2. 代码健康度 ────────────────────────────────────${NC}"
AS_ANY=$(grep -rn "as any" "$REPO_ROOT/src/" --include="*.ts" 2>/dev/null | grep -v "\.test\." | wc -l | tr -d ' ' || echo 0)
echo "  as any: ${AS_ANY}"
echo ""

# 3. 架构健康
echo -e "${CYAN}── 3. 架构健康 ──────────────────────────────────────${NC}"
ARCH_OUTPUT=$(bash "$REPO_ROOT/scripts/check-architecture.sh" 2>/dev/null || true)
if echo "$ARCH_OUTPUT" | grep -q '❌'; then
  echo "  🔴 存在跨层违规 — 请修复"
else
  echo "  ✅ 无跨层违规"
fi
echo ""

# 4. 下一步建议
echo -e "${CYAN}── 4. 下一步建议 ────────────────────────────────────${NC}"
UNCOMMITTED=$(git status --porcelain 2>/dev/null | grep -v "^?" | head -1 || true)

if [ -n "$UNCOMMITTED" ]; then
  echo -e "  ${GREEN}建议:${NC} 有未提交的代码变更。审查 → commit → push。"
  echo -e "  ${YELLOW}优先级:${NC} P0"
else
  echo -e "  ${GREEN}建议:${NC} 工作区干净。运行 task-start.sh 开始下一个任务。"
  echo -e "  ${YELLOW}优先级:${NC} P1"
fi
echo ""

# 5. 全局锚点
echo -e "${CYAN}── 5. 全局锚点 (每次做任务前重温) ─────────────────${NC}"
echo "  Synova = AI 组织诊断系统，核心是服务于增长"
echo "  五层架构: L1交互 → L2编排 → L3洞察 → L4本体 → L5存储"
echo "  八专家: 战略 / 组织 / 财务 / 营销 / 技术 / 行动 / 商业模式 / 知识"
echo "  当前分支: $(git branch --show-current 2>/dev/null || echo 'main')"
echo ""
echo "═══════════════════════════════════════════════════════"
echo ""
