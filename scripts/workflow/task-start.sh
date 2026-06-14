#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# 节点 ①: 任务启动 (Task Start)
#
# 触发: CLAUDE.md 指令 — 每次接受新任务时先运行
# 用法: bash scripts/workflow/task-start.sh "任务描述"
#
# Anthropic 原则: 写代码之前先问"做什么、影响哪里、怎么验证"
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
echo -e "${CYAN}  Anthropic Task Start — 写任何代码之前${RESET}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
echo ""
echo "  任务: ${TASK_DESC}"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ═══ Q1: 代码库健康 ═══
echo -e "${CYAN}📋 Q1: 代码库当前健康状态${RESET}"
cd "$ROOT"

# 快速 vitest (只跑结果)
TEST_OUTPUT=$(npx vitest run --reporter=basic 2>&1 | tail -5 || echo "测试运行失败")
TSC_COUNT=$(npx tsc --noEmit 2>&1 | grep -v "server/vendor/" | grep -v "packages/" | grep -c "error TS" 2>/dev/null || echo "0")
AS_ANY=$(grep -rn "as any" src/ --include="*.ts" 2>/dev/null | grep -v "\.test\." | grep -v "node_modules" | wc -l | tr -d '[:space:]') || AS_ANY=0

echo "  测试: $(echo "$TEST_OUTPUT" | head -1)"
echo "  tsc: ${TSC_COUNT} errors"
echo "  as any: ${AS_ANY} 处"

if [ "${TSC_COUNT:-0}" -gt 0 ] || [ "${AS_ANY:-0}" -gt 0 ]; then
  echo -e "  ${RED}⚠ 代码库不健康 — 建议先修复基础问题再开始新任务${RESET}"
fi
echo ""

# ═══ Q2: 影响范围 ═══
echo -e "${CYAN}📋 Q2: 影响范围分析${RESET}"
echo "  任务关键词:"
IFS=' ' read -ra KWS <<< "$TASK_DESC"
for kw in "${KWS[@]}"; do
  if [ ${#kw} -gt 2 ]; then
    SRC_COUNT=$(grep -rl "$kw" "$ROOT/src/" --include="*.ts" 2>/dev/null | grep -v "node_modules" | wc -l | tr -d '[:space:]') || SRC_COUNT=0
    TEST_COUNT=$(grep -rl "$kw" "$ROOT/tests/" --include="*.ts" 2>/dev/null | wc -l | tr -d '[:space:]') || TEST_COUNT=0
    echo "    \"$kw\": ${SRC_COUNT} 源文件, ${TEST_COUNT} 测试文件"
  fi
done
echo ""

# ═══ Q3: 铁律检查清单 ═══
echo -e "${CYAN}📋 Q3: 关键铁律提醒${RESET}"
echo ""
echo "  本次任务需关注:"
echo "    [ ] 铁律 0: 对齐了吗？用户旅程确认了吗？"
echo "    [ ] 铁律 1: 这是垂直切片还是水平分层？"
echo "    [ ] 铁律 0-2: 测试先写了吗？接线检查做了吗？"
echo "    [ ] 铁律 7: Done 标准是什么？入口→链路→结果？"
echo "    [ ] 铁律 34: 在 feature branch 上吗？"
echo ""

# ═══ Q4: 分支检查 ═══
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  echo -e "  ${RED}⚠ 当前在 ${BRANCH} 分支!${RESET}"
  echo -e "  ${RED}  铁律 34: 禁止直接在 main 上 commit。${RESET}"
  echo "  请先: git checkout -b feat/<任务名>"
  echo ""
fi

# ═══ 生成 Task Brief (迷你设计文档) ═══
# 固定头部 + 6 个必填字段。PreToolUse hook 物理强制全部非空。
	mkdir -p "$(dirname "$BRIEF_FILE")"
	BRIEF_FILE="$BRIEF_FILE" TASK_DESC="$TASK_DESC" BRANCH="$BRANCH" TSC_COUNT="$TSC_COUNT" AS_ANY="$AS_ANY" TEST_OUTPUT="$TEST_OUTPUT" python3 "$ROOT/scripts/workflow/generate-task-brief.py"
echo -e "${GREEN}✅ Task Brief 已生成: .claude/task-briefs/${TIMESTAMP}-${TASK_SLUG}.md${RESET}"
echo ""
echo -e "${CYAN}────────────────────────────────────────────────────────────${RESET}"
echo "  下一步: 填写 Task Brief 中的用户旅程和 Done 标准"
echo "          然后开始写代码"
echo -e "${CYAN}────────────────────────────────────────────────────────────${RESET}"
echo ""

exit 0
