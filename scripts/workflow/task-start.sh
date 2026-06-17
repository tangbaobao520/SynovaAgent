#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Loop Engineering v3.0 — 任务启动 (Task Start)
#
# 这是整个系统最重要的环节。
# 在写任何代码之前，先回答 3 个问题，把"自然语言意图"翻译成"可执行的规格"。
#
# 用法: bash scripts/workflow/task-start.sh "你的任务描述"
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; RESET='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

TASK_DESC="${*:-未命名任务}"
TASK_SLUG=$(echo "$TASK_DESC" | head -c 40 | tr ' ' '-' | tr -cd 'a-zA-Z0-9-')
TIMESTAMP=$(date +%Y-%m-%d-%H%M)
BRIEF_FILE="$ROOT/.claude/task-briefs/${TIMESTAMP}-${TASK_SLUG}.md"

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
echo -e "${CYAN}  Loop Engineering v3.0 — 任务启动${RESET}"
echo -e "${CYAN}  先想清楚，再动手。${RESET}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
echo ""
echo "  任务: ${TASK_DESC}"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ═══ 自动健康检查 (不提问，只展示) ═══
echo -e "${CYAN}📊 代码库快照${RESET}"
cd "$ROOT"

BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
AS_ANY=$(grep -rn "as any" src/ --include="*.ts" 2>/dev/null | grep -v "\.test\." | grep -v "node_modules" | wc -l | tr -d ' ') || AS_ANY=0
echo "  分支: ${BRANCH}  |  as any: ${AS_ANY}"

if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  echo -e "  ${RED}⚠ 当前在 ${BRANCH} 分支！铁律 34: 禁止直接在 main 上 commit。${RESET}"
  echo "  请先: git checkout -b feat/<任务名>"
fi

if [ "${AS_ANY:-0}" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠ 仓库中有 ${AS_ANY} 处 as any，建议先清理${RESET}"
fi
echo ""

# ═══ 3 个问题 ═══
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${CYAN}  请在 task brief 中回答以下 3 个问题后再开始写代码${RESET}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

echo -e "${YELLOW}Q1: 调研 — 这件事以前怎么做的？${RESET}"
echo ""
echo "  a) 你的训练数据里，业界对这类问题有什么最佳实践？"
echo "     有哪些已知的设计模式、库、架构方案？"
echo "  b) 如果是 Anthropic 或世界顶级工程团队拿到这个任务，"
echo "     他们会怎么分解？先做什么、后做什么？"
echo "  c) 在 memory/ 里搜索相关关键词，"
echo "     我们以前做过类似的事吗？犯过什么错？"
echo ""

echo -e "${YELLOW}Q2: 范围 — 最简方案是什么？${RESET}"
echo ""
echo "  最小可行实现是什么？什么可以不做？"
echo "  MVP 的边界在哪里？哪些是锦上添花、可以后续迭代的？"
echo ""

echo -e "${YELLOW}Q3: 验收 — 做完后用户能看到什么？${RESET}"
echo ""
echo "  从哪条路径触发？入口是什么？"
echo "  中间经过哪些步骤？结果在哪呈现？"
echo "  入口 → 交互 → 结果，三环节各是什么？"
echo ""

echo -e "${CYAN}────────────────────────────────────────────────────────────${RESET}"
echo ""

# ═══ 生成 Task Brief ═══
mkdir -p "$(dirname "$BRIEF_FILE")"
BRIEF_FILE="$BRIEF_FILE" TASK_DESC="$TASK_DESC" BRANCH="$BRANCH" AS_ANY="$AS_ANY" python3 "$ROOT/scripts/workflow/generate-task-brief.py"

echo -e "${GREEN}✅ Task Brief 已生成: .claude/task-briefs/${TIMESTAMP}-${TASK_SLUG}.md${RESET}"
echo ""
echo "  填写 Q1/Q2/Q3 和 Done 标准后，开始写代码。"
echo "  pre-commit 会在提交时物理检查 task brief 是否存在。"
echo ""
exit 0
