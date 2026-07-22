#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# hooks/post-commit.sh — V4.5.0 提交后处理
#
# 被 .git/hooks/post-commit 调用 (通过 core.hooksPath 或委托脚本)。
# 所有 session 共用同一份，修改即同步。
# ═══════════════════════════════════════════════════════════════════════════════
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MARKER="$ROOT/.claude/last-precommit-success"

# ═══ --no-verify 绕过检测 ═══
if [ -f "$MARKER" ]; then
  LAST=$(cat "$MARKER" 2>/dev/null | tr -d '[:space:]')
  NOW=$(date +%s)
  if [ -n "$LAST" ] && [ "$LAST" -gt 0 ] 2>/dev/null; then
    DIFF=$((NOW - LAST))
    if [ "$DIFF" -gt 120 ]; then
      echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) possible-bypass diff=${DIFF}s" >> "$ROOT/.claude/bypass.log"
    fi
  fi
  rm -f "$MARKER"
else
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) detected-bypass no-precommit-marker" >> "$ROOT/.claude/bypass.log"
fi

# V4.5.0: STATE.md 已移除。证据链由 git log 提供。
# 不再写入 STATE.md。

# ═══ 决策流程 ═══
bash "$ROOT/scripts/workflow/decide-next.sh" 2>/dev/null &
exit 0
