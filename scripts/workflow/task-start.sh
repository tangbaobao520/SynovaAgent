#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# task-start.sh — Loop Engineering V4.5.0: 任务启动检查点
#
# 生成 task brief → D200 context-injector 注入权威文档上下文
#
# 用法:
#   bash scripts/workflow/task-start.sh "任务描述"
#   TASK_DESC="任务描述" bash scripts/workflow/task-start.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TASK_DESC="${*:-${TASK_DESC:-}}"

if [[ -z "$TASK_DESC" ]]; then
  echo "❌ 用法: bash scripts/workflow/task-start.sh \"任务描述\""
  exit 1
fi

# 生成 task brief
TODAY=$(date +%Y-%m-%d)
TASK_ID="${TASK_ID:-${TODAY}-auto}"
BRIEF_FILE="$PROJECT_ROOT/.claude/task-briefs/${TASK_ID}.md"

export BRIEF_FILE TASK_DESC
python3 "$SCRIPT_DIR/generate-task-brief.py"

echo "✅ Task brief 已生成: $BRIEF_FILE"

# D200: 上下文注射 — 注入权威文档上下文到 Q1c 字段
INJECTOR="$PROJECT_ROOT/scripts/control-tower/context-injector.sh"
if [[ -f "$INJECTOR" ]]; then
  bash "$INJECTOR" --task-id "$TASK_ID" && echo "✅ 上下文注射完成" || echo "⚠ 上下文注射降级"
else
  echo "⚠ context-injector.sh 未找到 — 跳过注射"
fi
