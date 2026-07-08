#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Loop Engineering V4.4.4 — SessionStart: 流程锁前置
#
# Anthropic 原则 5: 物理强制，零 AI 自律。
# 根因: V4.4.4 的 PreToolUse hook 只拦截 Write/Edit。Bash/Git/文件检查等操作
#       完全绕过。两个 agent 在没跑 task-start 的情况下做了破坏性操作。
#
# V4.4.4 解法: 流程锁前置到 SessionStart。
#   SessionStart → 检查 workflow-state.json 是否为 brief-filled
#     ├─ 是 → 正常放行
#     └─ 否 → 写入 .claude/session-locked 标记
#
#   hook-block-write.sh (PreToolUse) → 检查 session-locked
#     ├─ 锁存在 → 只允许 task-start/scope-check/Read
#     └─ 锁不存在 → 正常执行
#
#   task-start.sh → 完成后清除 session-locked
#
# 这不需要 AI 自律。锁是磁盘上的物理文件，bash 读它做硬阻断。
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
WORKFLOW_STATE="$ROOT/.claude/workflow-state.json"
LOCK_FILE="$ROOT/.claude/session-locked"

# 检查 workflow-state.json 是否存在且为 brief-filled
if [ -f "$WORKFLOW_STATE" ]; then
  STATE=$(python3 -c "import json; print(json.load(open('$WORKFLOW_STATE')).get('step',''))" 2>/dev/null || echo "")
  if [ "$STATE" = "brief-filled" ]; then
    # 工作流已完成 → 清除任何残留锁，放行
    rm -f "$LOCK_FILE"
    exit 0
  fi
fi

# 工作流未完成 → 写入锁文件
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) session-locked: workflow not brief-filled" > "$LOCK_FILE"
echo "[V4.4.4] SessionStart: 流程未完成 — 已锁定。请先运行 task-start.sh。"
exit 0
