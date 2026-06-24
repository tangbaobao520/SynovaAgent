#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Loop Engineering V4.2.1 — 任务启动 (Task Start)
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
echo -e "${CYAN}  Loop Engineering V4.2.1 — 任务启动${RESET}"
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

echo -e "${YELLOW}Q1: 调研 — Anthropic 团队会怎么做？${RESET}"
echo ""
echo "  a) 在 memory/ 里搜索相关关键词。我们以前做过类似的事吗？犯过什么错？"
echo "     引用至少 1 个 memory/ 文件。写入 plan.json memory_refs。"
echo "  b) Anthropic 工程团队拿到这个任务，他们的决策链路是什么？"
echo "     引用 CLAUDE.md §1 的原则。写入 plan.json principles。"
echo ""

echo -e "${YELLOW}Q2: 方案 — 重写还是复用？${RESET}"
echo ""
echo "  二选一。不准有中间态。写入 plan.json approach。"
echo "  rewrite: 列出需要提取的算法/逻辑。适配 SynovaAgent 架构。"
echo "  reuse:   列出复用对象，证明它不需要修改。"
echo "  桥接 (import + re-export): 默认不允许。铁律 46。"
echo ""

echo -e "${YELLOW}Q3: 验收 — 怎么证明不是空壳？${RESET}"
echo ""
echo "  验收标准必须可证伪。禁止'文件存在''目录存在'。"
echo "  verify 命令必须证明能力可用，不是证明文件在磁盘上。"
echo "  每条 plan.json principles 必须对应至少一个 verify: 命令。"
echo ""

echo -e "${CYAN}────────────────────────────────────────────────────────────${RESET}"
echo ""

# ═══ 生成 Task Brief ═══
mkdir -p "$(dirname "$BRIEF_FILE")"
BRIEF_FILE="$BRIEF_FILE" TASK_DESC="$TASK_DESC" BRANCH="$BRANCH" AS_ANY="$AS_ANY" python3 "$ROOT/scripts/workflow/generate-task-brief.py"
# V4.1.2: 清除 SessionStart 流程锁
rm -f "$ROOT/.claude/session-locked" 2>/dev/null


echo -e "${GREEN}✅ Task Brief 已生成: .claude/task-briefs/${TIMESTAMP}-${TASK_SLUG}.md${RESET}"
echo ""
echo "  填写 Q1/Q2/Q3 和 Done 标准后，开始写代码。"
echo "  pre-commit 会在提交时物理检查 task brief 是否存在。"
echo ""

# ── v3.2: 自动触发产品对齐检查 ──
SCOPE_CHECK="$ROOT/scripts/workflow/scope-check.sh"
if [ -x "$SCOPE_CHECK" ]; then
  bash "$SCOPE_CHECK"
else
  echo -e "${YELLOW}⚠ scope-check.sh 未就绪 — 跳过产品对齐检查${RESET}"

# v3.5: 写入工作流状态 (task-started)
WORKFLOW_STATE="$ROOT/.claude/workflow-state.json"
python3 -c "import json; json.dump({"step":"task-started","brief":"${TIMESTAMP}-${TASK_SLUG}.md","ts":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}, open("$WORKFLOW_STATE","w"))" 2>/dev/null
fi

exit 0
