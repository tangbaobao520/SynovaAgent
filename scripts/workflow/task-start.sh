#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════�?
# Loop Engineering V4.4.0 �?任务启动 (Task Start)
#
# 这是整个系统最重要的环节�?
# 在写任何代码之前，先回答 3 个问题，�?自然语言意图"翻译�?可执行的规格"�?
#
# 用法: bash scripts/workflow/task-start.sh "你的任务描述"
# ══════════════════════════════════════════════════════════════════════════════�?
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
echo -e "${CYAN}  Loop Engineering V4.4.0 �?任务启动${RESET}"
echo -e "${CYAN}  先想清楚，再动手�?{RESET}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
echo ""
echo "  任务: ${TASK_DESC}"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ══�?自动健康检�?(不提问，只展�? ══�?
echo -e "${CYAN}📊 代码库快�?{RESET}"
cd "$ROOT"

BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
AS_ANY=$(grep -rn "as any" src/ --include="*.ts" 2>/dev/null | grep -v "\.test\." | grep -v "node_modules" | wc -l | tr -d ' ') || AS_ANY=0
echo "  分支: ${BRANCH}  |  as any: ${AS_ANY}"

if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  echo -e "  ${RED}�?当前�?${BRANCH} 分支！铁�?34: 禁止直接�?main �?commit�?{RESET}"
  echo "  请先: git checkout -b feat/<任务�?"
fi

if [ "${AS_ANY:-0}" -gt 0 ]; then
  echo -e "  ${YELLOW}�?仓库中有 ${AS_ANY} �?as any，建议先清理${RESET}"
fi
echo ""

# ══�?3 个问�?══�?
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${CYAN}  请在 task brief 中回答以�?3 个问题后再开始写代码${RESET}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

echo -e "${YELLOW}Q1: 调研 �?Anthropic 团队会怎么做？${RESET}"
echo ""
echo "  a) �?memory/ 里搜索相关关键词。我们以前做过类似的事吗？犯过什么错�?
echo "     引用至少 1 �?memory/ 文件。写�?plan.json memory_refs�?
echo "  b) Anthropic 工程团队拿到这个任务，他们的决策链路是什么？"
echo "     引用 CLAUDE.md §1 的原则。写�?plan.json principles�?
echo ""

echo -e "${YELLOW}Q2: 方案 �?重写还是复用�?{RESET}"
echo ""
echo "  二选一。不准有中间态。写�?plan.json approach�?
echo "  rewrite: 列出需要提取的算法/逻辑。适配 SynovaAgent 架构�?
echo "  reuse:   列出复用对象，证明它不需要修改�?
echo "  桥接 (import + re-export): 默认不允许。铁�?46�?
echo ""

echo -e "${YELLOW}Q3: 验收 �?怎么证明不是空壳�?{RESET}"
echo ""
echo "  验收标准必须可证伪。禁�?文件存在''目录存在'�?
echo "  verify 命令必须证明能力可用，不是证明文件在磁盘上�?
echo "  每条 plan.json principles 必须对应至少一�?verify: 命令�?
echo ""

echo -e "${CYAN}────────────────────────────────────────────────────────────${RESET}"
echo ""

# ══�?生成 Task Brief ══�?
mkdir -p "$(dirname "$BRIEF_FILE")"
BRIEF_FILE="$BRIEF_FILE" TASK_DESC="$TASK_DESC" BRANCH="$BRANCH" AS_ANY="$AS_ANY" python3 "$ROOT/scripts/workflow/generate-task-brief.py"
# V4.1.2: 清除 SessionStart 流程�?
rm -f "$ROOT/.claude/session-locked" 2>/dev/null


echo -e "${GREEN}�?Task Brief 已生�? .claude/task-briefs/${TIMESTAMP}-${TASK_SLUG}.md${RESET}"
# V4.3.0: 记录当前任务 brief 路径（pre-commit 从此读取，不�?find -name�?
echo "${TIMESTAMP}-${TASK_SLUG}.md" > "$ROOT/.claude/current-brief"
# V4.3.0: 自动更新 STATE.md Active Task
sed -i "s/^| Description.*/| Description | ${TASK_DESC} |/" "$ROOT/STATE.md" 2>/dev/null
sed -i "s/^| Brief .*/| Brief | ${TIMESTAMP}-${TASK_SLUG}.md |/" "$ROOT/STATE.md" 2>/dev/null
sed -i "s/^| Status.*/| Status | in-progress |/" "$ROOT/STATE.md" 2>/dev/null
echo ""
echo "  填写 Q1/Q2/Q3 �?Done 标准后，开始写代码�?
echo "  ��д Q1/Q2/Q3 �� Done ��׼�󣬿�ʼд���롣"
echo ""
echo "  pre-commit �� 6 ����飺"
echo "    - brief �Ƿ���� + �ֶ��Ƿ�ǿ�"
echo "    - Q2 �������ļ��б��Ƿ���ʵ�� git diff һ�� (check-brief-vs-code.sh)"
echo "    - Q2 �����Ľ����Ƿ����� (check-brief-vs-code.sh)"
echo "    - ÿ�� Done ��׼�Ƿ���� verify: ��ִ������ (check-verifiable-done.sh)"
echo "    - Q1 ԭ�������Ƿ� <= Done verify ���� (check-plan-integrity.sh)"
  echo -e "${YELLOW}�?scope-check.sh 未就�?�?跳过产品对齐检�?{RESET}"

# v3.5: 写入工作流状�?(task-started)
WORKFLOW_STATE="$ROOT/.claude/workflow-state.json"
python3 -c "import json; json.dump({"step":"task-started","brief":"${TIMESTAMP}-${TASK_SLUG}.md","ts":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}, open("$WORKFLOW_STATE","w"))" 2>/dev/null
fi

exit 0
