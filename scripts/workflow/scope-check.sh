#!/bin/bash
# Loop Engineering V4.4.0 — scope-check.sh (产品对齐 4 问)
#
# 在 task-start.sh 之后、写代码之前运行。
# 这不是门禁——这是给 Claude 读的上下文注入。
# 目的：确保每次编码任务都锚定在产品目标上，不偏离、不过度、不偷懒。
#
# 用法: bash scripts/workflow/scope-check.sh

set -euo pipefail

CYAN='\033[0;36m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; RED='\033[0;31m'; RESET='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TODAY=$(date +%Y-%m-%d)

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
echo -e "${CYAN}  Loop Engineering V4.3.0 — 产品对齐检查${RESET}"
echo -e "${CYAN}  写代码之前，先确认你在做对的事。${RESET}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
echo ""

# ── 找到今日 task brief (仪表盘需要用到) ──
BRIEF=$(find "$ROOT/.claude/task-briefs/" -type f -name "${TODAY}*" 2>/dev/null | xargs ls -t 2>/dev/null | head -1)

# ═══════════════════════════════════════════════════════════════
# 项目全貌仪表盘 (v3.2: 每次任务前强制注入)
# ═══════════════════════════════════════════════════════════════

echo -e "${CYAN}━━━ 🏗️ 项目全貌 — 我们在盖什么？━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

# ── 产品身份 ──
echo -e "  ${GREEN}产品:${RESET} Synova — AI 诊断 Agent"
echo "  定位: 驻扎企业内部的 7×24 诊断系统。Agent 不是 ChatBot。"
echo "  用户: FDE(前线部署工程师) → 企业主(最终受益者)"
echo "  核心问题: 这家企业的增长卡在哪里？现在该做什么？"
echo ""

# ── 当前阶段 ──
DEADLINE="2026-06-25"
DAYS_LEFT=$(( ($(date -d "$DEADLINE" +%s 2>/dev/null || date -j -f "%Y-%m-%d" "$DEADLINE" +%s 2>/dev/null || echo 0) - $(date +%s)) / 86400 ))
[ "$DAYS_LEFT" -lt 0 ] && DAYS_LEFT="?"

echo -e "  ${YELLOW}当前阶段:${RESET} Phase 0 — 6月25日演示冲刺"
echo -e "  ${YELLOW}剩余天数:${RESET} ${RED}${DAYS_LEFT} 天${RESET}"
echo -e "  ${YELLOW}目标:${RESET} 黄学松独立完成客户诊断全流程"
echo ""

# ── 架构地图 (我们盖的是五层楼，每层有不同住户) ──
echo -e "  ${CYAN}五层架构 (你在哪层施工？):${RESET}"
echo "    L1 交互 ← 你在这 (Web首页 / 对话页 / 报告展示)"
echo "    L2 编排 ← ConversationEngine (另一个Claude)"
echo "    L3 洞察 ← 8专家 + 25哨兵 (已完成)"
echo "    L4 本体 ← GraphStore + 知识库 (另一个Claude)"
echo "    L5 存储 ← SQLite (基础设施，勿动)"
echo ""

# ── 当前任务拼图 (从 task brief 推断) ──
if [ -n "${BRIEF:-}" ]; then
  TASK_LINE=$(head -1 "$BRIEF" 2>/dev/null | sed 's/^# //' | head -c 60)
  echo -e "  ${GREEN}本次任务:${RESET} ${TASK_LINE:-未指定}"
else
  echo -e "  ${RED}⚠ 未找到今日 task brief — 请先运行 task-start.sh${RESET}"
fi
echo ""

# ── 我的职责边界 (Claude Code/DeepSeek 负责的部分) ──
echo -e "  ${CYAN}我的职责 (前端+稳定性+全链路):${RESET}"
echo "    ✅ Day1: LLM降级处理"
echo "    ✅ Day2: Web首页 + 双入口 + 主题"
echo "    ⏳ Day3: 对话诊断页 (Agent访谈UI+意图识别)"
echo "    ⏳ Day4: 诊断报告展示页"
echo "    ⏳ Day5: 端到端联调 (真实客户数据)"
echo "    ⏳ Day6: 降级方案 + 黄学松独立跑通"
echo ""

echo -e "  ${CYAN}另一个 Claude 的职责 (专家体系+报告+文件化):${RESET}"
echo "    ✅ 专家 SOUL/RULES/KNOWLEDGE 文件"
echo "    ✅ 核心理论体系 v2.1"
echo "    ✅ 文件优先引擎升级"
echo "    ✅ 技能体系扩展"
echo "    ⏳ 诊断报告 HTML 模板美化"
echo "    ⏳ 八维提取准确度优化"
echo ""

# ── 明确边界：绝对不能碰的 ──
echo -e "  ${RED}🚫 禁止触碰:${RESET}"
echo "    ❌ expert/ 目录下的 SOUL/RULES/KNOWLEDGE 文件 (另一个Claude)"
echo "    ❌ packages/engine-core/ 诊断管线 (另一个Claude)"
echo "    ❌ src/l3/ 专家逻辑 (除非修崩溃bug)"
echo "    ❌ L5 存储层 / 数据库 schema"
echo ""

echo -e "${CYAN}────────────────────────────────────────────────────────────${RESET}"
echo ""

# ── 校验 task brief ──
if [ -z "${BRIEF:-}" ]; then
  echo -e "${RED}⚠ 未找到今日 task brief。${RESET}"
  echo "  请先运行: bash scripts/workflow/task-start.sh \"你的任务描述\""
  exit 1
fi

TASK_TITLE=$(head -1 "$BRIEF" | sed 's/^# //' | head -c 80)
echo "  任务: ${TASK_TITLE}"
echo "  Brief: ${BRIEF}"
echo ""

# ── 注入全局产品上下文 ──
echo -e "${CYAN}━━━ 全局锚点（每次任务前重温）━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
if [ -f "$ROOT/.claude/PRODUCT-BRIEF.md" ]; then
  # 提取产品一句话定位
  grep -A1 "Synova 是什么" "$ROOT/.claude/PRODUCT-BRIEF.md" 2>/dev/null | tail -1 || true
  echo ""
fi
echo "  Synova = AI 诊断 Agent。核心问题: 这家企业的增长卡在哪里？现在该做什么？"
echo "  五层架构: L1交互 → L2编排 → L3洞察 → L4本体 → L5存储"
echo "  8 专家: 战略/组织/财务/营销/技术/行动/商业模式/知识"
echo "  7 维度 25 哨兵: D1增长/D2组织/D3人+Agent/D4软件/D5适配/D6战略/D7风险"
echo "  当前分支: $(git branch --show-current 2>/dev/null || echo 'unknown')"
echo ""

# ── 产品对齐 4 问 ──
echo -e "${CYAN}━━━ 产品对齐 4 问 — 请在回复中逐项回答 ━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

echo -e "${YELLOW}Q1: 拼图位置 — 这个任务在产品的哪一块？${RESET}"
echo "  触及哪一层 (L1-L5)？哪个维度 (D1-D7)？哪几个专家？"
echo "  是 FDE 路径还是 Sentinel 路径？还是基础设施？"
echo ""

echo -e "${YELLOW}Q2: 用户可见 — 做完后，用户能看到什么？${RESET}"
echo "  入口: 用户从哪触发？（API？cron？FDE 操作台？）"
echo "  处理: 中间经过哪些步骤？"
echo "  结果: 最终展示在哪？（HTML 报告？API 响应？哨兵工单？）"
echo "  说不清入口→处理→结果三环节 = 还没想清楚。"
echo ""

echo -e "${YELLOW}Q3: 最简方案 — 有没有更简单的做法？什么可以不做的？${RESET}"
echo "  最小可行实现是什么？MVP 边界在哪？"
echo "  哪些是锦上添花、可以后续迭代的？"
echo "  强制列出: 本任务不做什么（明确排除）。"
echo ""

echo -e "${YELLOW}Q4: 历史教训 — 上次做类似的事，我们犯过什么错？${RESET}"
echo "  在 memory/ 中搜索相关关键词。"
echo "  我们以前做过类似的事吗？犯过什么错？"
echo "  那次犯错的根因是什么？这次怎么避免？"
echo ""

# ── 检查 memory/ 中是否有相关教训 ──
echo -e "${CYAN}━━━ memory/ 教训自动检索 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

MEMORY_DIR="$ROOT/memory"
if [ -d "$MEMORY_DIR" ]; then
  KEYWORDS=$(grep -oE '[一-鿿]{2,8}|sentinel|expert|skill|哨兵|专家|技能|诊断|GraphBridge|baseline|跨层|architecture|硬编码|measure' "$BRIEF" 2>/dev/null | sort -u | head -20 || true)
  if [ -n "$KEYWORDS" ]; then
    FOUND=0
    while IFS= read -r memfile; do
      [ -z "$memfile" ] && continue
      [ ! -f "$memfile" ] && continue
      basename=$(basename "$memfile")
      if echo "$basename" | grep -qE '^MEMORY\.md$|^project-state'; then continue; fi
      while IFS= read -r kw; do
        [ -z "$kw" ] && continue
        [ ${#kw} -lt 2 ] && continue
        if grep -qi "$kw" "$memfile" 2>/dev/null; then
          if [ "$FOUND" -eq 0 ]; then
            echo "  以下 memory/ 记录可能与本任务相关:"
            echo ""
            FOUND=1
          fi
          name=$(basename "$memfile" .md)
          why=$(grep "^\*\*Why:\*\*" "$memfile" 2>/dev/null | head -1 | sed 's/\*\*Why:\*\* //' | head -c 120)
          echo "  📋 ${name}"
          [ -n "$why" ] && echo "     ${why}"
          echo ""
          break
        fi
      done <<< "$KEYWORDS"
    done < <(find "$MEMORY_DIR" -name "*.md" -type f 2>/dev/null || true)
    if [ "$FOUND" -eq 0 ]; then
      echo "  (无匹配教训 — 可能是第一次做这类任务)"
    fi
  fi
else
  echo "  (memory/ 目录不存在 — 暂无历史教训)"
fi

echo ""
echo -e "${CYAN}────────────────────────────────────────────────────────────${RESET}"
echo -e "${GREEN}  回答完 Q1-Q4 后，开始写代码。${RESET}"
echo -e "${GREEN}  pre-commit 会在提交时物理检查 task brief 是否存在。${RESET}"

# v3.3: 更新工作流状态 (scope-checked)
WORKFLOW_STATE="$ROOT/.claude/workflow-state.json"
if [ -f "$WORKFLOW_STATE" ]; then
  python3 -c "import json; d=json.load(open("$WORKFLOW_STATE")); d["step"]="scope-checked"; json.dump(d, open("$WORKFLOW_STATE","w"))" 2>/dev/null
fi
echo ""
exit 0
