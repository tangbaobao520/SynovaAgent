#!/usr/bin/env bash
# decide-next.sh — Loop Engineering V4.2.9: 每次提交后智能决策建议
# post-commit 自动触发。必须瞬时完成 (<2s)。
# v3.2: 从"工作区干净"→接实际项目状态，给具体建议。
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Anthropic 决策流程 — 下一步行动建议 (v3.2)"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ═══ 1. 最近完成 ═══
echo -e "${CYAN}── 1. 最近完成 ──────────────────────────────────────${NC}"
git log --oneline -5 2>/dev/null | while read -r line; do
  echo "  $line"
done
echo ""

# ═══ 2. 代码健康度 ═══
echo -e "${CYAN}── 2. 代码健康度 ────────────────────────────────────${NC}"
AS_ANY=$(grep -rn "as any\b" "$REPO_ROOT/src/" --include="*.ts" 2>/dev/null | grep -v "\.test\." | grep -v "node_modules" | wc -l | tr -d ' ' || echo 0)
echo "  as any: ${AS_ANY}"

# 未跟踪的 task briefs (积压)
STALE_BRIEFS=$(find "$REPO_ROOT/.claude/task-briefs/" -name "*.md" -mtime +7 2>/dev/null | wc -l | tr -d ' ' || echo 0)
if [ "$STALE_BRIEFS" -gt 3 ]; then
  echo -e "  ${YELLOW}⚠ 旧 task briefs: ${STALE_BRIEFS} 个 (>7天未清理)${NC}"
fi
echo ""

# ═══ 3. 架构健康 ═══
echo -e "${CYAN}── 3. 架构健康 ──────────────────────────────────────${NC}"
if [ -x "$REPO_ROOT/scripts/check-architecture.sh" ]; then
  ARCH_OUTPUT=$(bash "$REPO_ROOT/scripts/check-architecture.sh" 2>/dev/null || true)
  if echo "$ARCH_OUTPUT" | grep -q '❌'; then
    echo -e "  ${RED}🔴 存在跨层违规 — 请修复再继续${NC}"
  else
    echo "  ✅ 无跨层违规"
  fi
else
  echo "  ⚠ check-architecture.sh 不存在"
fi
echo ""

# ═══ 4. 下一步建议 (智能版) ═══
echo -e "${CYAN}── 4. 下一步建议 ────────────────────────────────────${NC}"

UNCOMMITTED=$(git status --porcelain 2>/dev/null | grep -v "^?" | head -1 || true)
if [ -n "$UNCOMMITTED" ]; then
  echo -e "  ${GREEN}→${NC} 有未提交变更。审查 → commit → push。"
  echo -e "  ${YELLOW}优先级:${NC} P0"
else
  # 分析最近工作模式，给具体建议
  RECENT=$(git log --oneline -10 --format="%s" 2>/dev/null || echo "")

  # 模式 1: 最近在修架构
  if echo "$RECENT" | head -3 | grep -q "architecture\|fix(architecture)\|无限扩展"; then
    echo -e "  ${GREEN}→${NC} 架构修复刚完成。下次做功能前跑 scope-check.sh 确认产品对齐。"
    echo -e "  ${YELLOW}优先级:${NC} P1"
    echo ""
    echo "  建议下一步: D5 安全边界哨兵（手册 §14.7 唯一缺失 D5）"
    echo "              或 一对多对话+RBAC（多用户前提）"

  # 模式 2: 最近在做哨兵
  elif echo "$RECENT" | head -3 | grep -q "sentinel\|哨兵\|D1\|D3"; then
    REMAINING=""
    # 检查 D5 (4 sentinels)
    D5_COUNT=$(ls "$REPO_ROOT/src/sentinel/adapters/" 2>/dev/null | grep -c "api-accessibility\|data-readiness\|protocol-coverage" || echo 0)
    if [ "$D5_COUNT" -lt 3 ]; then REMAINING="$REMAINING D5($((3-D5_COUNT)))"; fi
    # 检查 D6 (1 sentinel)
    if [ ! -f "$REPO_ROOT/src/sentinel/adapters/seven-powers-sentinel.ts" ]; then REMAINING="$REMAINING D6"; fi

    if [ -n "$REMAINING" ]; then
      echo -e "  ${GREEN}→${NC} 哨兵增强进行中。剩余缺口:${REMAINING}"
      echo -e "  ${YELLOW}优先级:${NC} P1"
    else
      echo -e "  ${GREEN}→${NC} 哨兵增强完成。下一步: 真实数据流验证 或 RBAC。"
      echo -e "  ${YELLOW}优先级:${NC} P1"
    fi

  # 模式 3: 最近在修数据/基建
  elif echo "$RECENT" | head -3 | grep -q "数据\|baseline\|路由\|数据采集"; then
    echo -e "  ${GREEN}→${NC} 基础设施就绪。下一步: D1/D3 哨兵增强（如果还没做）或 scope-check 新任务。"
    echo -e "  ${YELLOW}优先级:${NC} P1"

  # 默认
  else
    echo -e "  ${GREEN}→${NC} 工作区干净。运行 task-start.sh + scope-check.sh 开始新任务。"
    echo -e "  ${YELLOW}优先级:${NC} P1"
  fi
fi
echo ""

# ═══ 5. 全局锚点 ═══
echo -e "${CYAN}── 5. 全局锚点 (每次做任务前重温) ─────────────────${NC}"
if [ -f "$REPO_ROOT/.claude/PRODUCT-BRIEF.md" ]; then
  # 提取产品一句话
  grep "Synova 要回答的核心问题" "$REPO_ROOT/.claude/PRODUCT-BRIEF.md" 2>/dev/null | head -1 | sed 's/.*：/核心问题:/' || true
else
  echo "  Synova = AI 组织诊断系统，核心是服务于增长"
fi
echo "  五层架构: L1交互 → L2编排 → L3洞察 → L4本体 → L5存储"
echo "  八专家: 战略 / 组织 / 财务 / 营销 / 技术 / 行动 / 商业模式 / 知识"
echo "  当前分支: $(git branch --show-current 2>/dev/null || echo 'main')"
echo ""

echo "═══════════════════════════════════════════════════════"
echo ""
exit 0
