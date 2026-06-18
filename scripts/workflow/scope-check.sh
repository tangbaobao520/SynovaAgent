#!/bin/bash
# Loop Engineering v3.1 — scope-check.sh (产品对齐 4 问)
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
echo -e "${CYAN}  Loop Engineering v3.1 — 产品对齐检查${RESET}"
echo -e "${CYAN}  写代码之前，先确认你在做对的事。${RESET}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
echo ""

# ── 找到今日 task brief ──
BRIEF=$(find "$ROOT/.claude/task-briefs/" -type f -name "${TODAY}*" 2>/dev/null | xargs ls -t 2>/dev/null | head -1)
if [ -z "$BRIEF" ]; then
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
echo ""
exit 0
