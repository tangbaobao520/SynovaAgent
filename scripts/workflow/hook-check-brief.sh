#!/bin/bash
# PostToolUse hook: 检查今日 task brief 是否存在
TODAY=$(date +%Y-%m-%d)
BRIEF=$(find .claude/task-briefs/ -name "${TODAY}*" 2>/dev/null | head -1)
if [ -z "$BRIEF" ]; then
  echo "[门禁] 无今日 task brief — 提交会被 pre-commit 拒绝"
  echo "  运行: bash scripts/workflow/task-start.sh \"你的任务描述\""
fi
