#!/usr/bin/env bash
# decide-next.sh — 完成任务后，按 Anthropic 决策流程提出下一步建议
#
# 铁律 0: 每个任务完成后，重新审视全局，提出下一个行动建议。
# 不是拍脑袋。基于当前代码状态 + ST# ATE.md + git log。
#
# 用法: bash scripts/workflow/decide-next.sh
# 输出: 下一步建议 (含优先级 + 依据)
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Anthropic 决策流程 — 下一步行动建议"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ═══ 1. 最近做了什么 ═══
echo -e "${CYAN}── 1. 最近完成 ──────────────────────────────────────${NC}"
git log --oneline -5 2>/dev/null | while read -r line; do
  echo "  $line"
done
echo ""

# ═══ 2. 代码状态 ═══
echo -e "${CYAN}── 2. 代码健康度 ────────────────────────────────────${NC}"

# 统计 @state: 标记
REAL=$(grep -r '@state:.*real' "$REPO_ROOT/src/" "$REPO_ROOT/packages/" --include="*.ts" 2>/dev/null | wc -l || echo 0)
SKEL=$(grep -r '@state:.*skeleton' "$REPO_ROOT/src/" "$REPO_ROOT/packages/" --include="*.ts" 2>/dev/null | wc -l || echo 0)
PLACE=$(grep -r '@state:.*placeholder' "$REPO_ROOT/src/" "$REPO_ROOT/packages/" --include="*.ts" 2>/dev/null | wc -l || echo 0)
NO_STATE=$(find "$REPO_ROOT/src" "$REPO_ROOT/packages" -name '*.ts' -not -path '*/node_modules/*' -not -name '*.d.ts' 2>/dev/null | while read -r f; do
  grep -q '@state:' "$f" 2>/dev/null || echo "$f"
done | wc -l || echo 0)

echo "  🟢 real:        $REAL"
echo "  🟡 skeleton:    $SKEL"
echo "  🔴 placeholder: $PLACE"
echo "  ⬜ 无标记:      $NO_STATE"
echo ""

# ═══ 3. 架构违规 ═══
echo -e "${CYAN}── 3. 架构健康 ──────────────────────────────────────${NC}"
ARCH_OUTPUT=$(bash "$REPO_ROOT/scripts/check-architecture.sh" 2>/dev/null || true)
if echo "$ARCH_OUTPUT" | grep -q '❌'; then
  CROSS=$(echo "$ARCH_OUTPUT" | grep -c '❌' || echo 0)
  echo "  🔴 跨层违规: ${CROSS} 处"
else
  echo "  ✅ 无跨层违规"
fi

# ═══ 4. 决策树 ═══
echo -e "${CYAN}── 4. 下一步建议 ────────────────────────────────────${NC}"
echo ""

# 决策逻辑
SUGGESTION=""
PRIORITY=""

if [ "$PLACE" -gt 0 ] || [ "$NO_STATE" -gt 0 ]; then
  SUGGESTION="消除占位代码: ${PLACE} 个 @state:placeholder + ${NO_STATE} 个无标记文件。优先处理标记为 skeleton 的模块——接口已定义，补齐数据源即可升级为 real。"
  PRIORITY="P1"
elif [ "$SKEL" -gt 3 ]; then
  SUGGESTION="升级骨架模块: ${SKEL} 个 @state:skeleton 文件。选一个对演示最有价值的，接真实数据源使其升级为 @state:real。"
  PRIORITY="P0"
else
  # 检查是否跑通了端到端管线
  if [ -f "$REPO_ROOT/tests/output/mvp-sample-report.html" ]; then
    SUGGESTION="MVP 骨架已跑通。下一步: 接真实 DeepSeek API 跑一次端到端诊断管线，而非 mock。验证八维度提取 + 报告生成的完整链路。"
    PRIORITY="P0"
  else
    SUGGESTION="跑通 MVP 端到端管线: 上传示例文档 → 真实 LLM 八维度提取 → 诊断引擎 → 金字塔报告。这是当前最高优先级的用户价值。"
    PRIORITY="P0"
  fi
fi

echo -e "  ${GREEN}建议:${NC} ${SUGGESTION}"
echo -e "  ${YELLOW}优先级:${NC} ${PRIORITY}"
echo ""

# ═══ 5. 一页纸提醒 ═══
echo -e "${CYAN}── 5. 全局锚点 (每次做任务前重温) ─────────────────${NC}"
echo "  Synova = AI 组织诊断系统，核心是服务于增长"
echo "  五层架构: L1交互 → L2编排 → L3洞察 → L4本体 → L5存储"
echo "  六专家: 战略 / 组织 / 财务 / 营销 / 技术 / 知识库"
echo "  当前分支: $(git branch --show-current 2>/dev/null || echo 'main')"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo ""
