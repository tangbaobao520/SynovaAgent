#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# hook-post-tool-use.sh — PostToolUse Hook (D218)
#
# 权威文档 #17 Ch4 实现表 462.
# 在 Agent 文件写入后释放写入锁。
# hook-block-write.sh（PreToolUse）负责 acquire，此 hook 负责 release。
#
# 用法: 由 Claude Code PostToolUse hook 调用（.claude/settings.json 配置）
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOCK_SCRIPT="$PROJECT_ROOT/scripts/control-tower/write_lock.py"
TARGET_FILE="${FILE_PATH:-${1:-}}"

if [[ -z "$TARGET_FILE" ]]; then
  exit 0
fi

# D218: 写入锁 — 文件写入后 release
if [[ -f "$LOCK_SCRIPT" ]]; then
  python3 "$LOCK_SCRIPT" release "$TARGET_FILE" 2>/dev/null || true
fi
