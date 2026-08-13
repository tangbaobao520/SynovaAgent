#!/bin/bash
# v3.4: 记录 --no-verify 使用
LOG="$1/.claude/no-verify.log"
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) --no-verify used" >> "$LOG"
