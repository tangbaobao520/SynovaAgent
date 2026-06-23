#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# hook-block-no-q0.sh — PreToolUse: Q0 不填 = 拒绝写代码 (V3.8)
#
# 物理强制: 不依赖 agent 自律。Q0 未填时，Write/Edit 工具调用被拒绝。
#
# 触发时机: PreToolUse — 每次 Write/Edit 之前
# 阻断条件: 今日 task brief 不存在 或 Q0 字段未填写
#
# 注册方式 (.claude/settings.json):
#   "hooks": {
#     "PreToolUse": [
#       { "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": "bash scripts/hook-block-no-q0.sh" }] }
#     ]
#   }
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
TODAY=$(date +%Y-%m-%d)

# 找到今天的 task brief
BRIEF=$(find "$ROOT/.claude/task-briefs/" -type f -name "${TODAY}*" 2>/dev/null | xargs ls -t 2>/dev/null | head -1)

# 没有 brief → 阻断
if [ -z "$BRIEF" ]; then
  echo "🔴 [hook-block-no-q0] 今日无 task brief。"
  echo "   请先运行: bash scripts/workflow/task-start.sh \"任务描述\""
  echo "   Q0 必须填写后才能写代码。"
  exit 1
fi

# 提取 Q0 段落到下一个 ## 标题
Q0_SECTION=$(awk '/^## Q0:/{found=1; next} /^## /{if(found) exit} found' "$BRIEF" 2>/dev/null)

# 去掉 HTML 注释和空行
Q0_FILLED=$(echo "$Q0_SECTION" | grep -v "^<!--\|^$" | tr -d "[:space:]" | head -1)

if [ -z "$Q0_FILLED" ] || [ ${#Q0_FILLED} -lt 10 ]; then
  echo "🔴 [hook-block-no-q0] Q0 未填写。"
  echo "   Q0 = 项目拼图 + 文件审计 + 决策。"
  echo "   请填写 brief: $BRIEF"
  exit 1
fi

# Q0a/b/c 都有实际内容（至少一项非模板）
Q0A=$(echo "$Q0_SECTION" | awk '/^### a\)/{found=1; next} /^### b\)/{if(found) exit} found' | grep -v "^<!--\|^$" | tr -d "[:space:]" | head -1)
Q0B=$(echo "$Q0_SECTION" | awk '/^### b\)/{found=1; next} /^### c\)/{if(found) exit} found' | grep -v "^<!--\|^$" | tr -d "[:space:]" | head -1)

if [ -z "$Q0A" ] || [ ${#Q0A} -lt 5 ]; then
  echo "🔴 [hook-block-no-q0] Q0a (项目拼图) 未填写。"
  exit 1
fi

if [ -z "$Q0B" ] || [ ${#Q0B} -lt 5 ]; then
  echo "🔴 [hook-block-no-q0] Q0b (文件审计) 未填写。"
  exit 1
fi

# 通过 — 允许写代码
exit 0
