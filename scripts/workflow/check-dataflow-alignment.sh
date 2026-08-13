#!/bin/bash
# check-dataflow-alignment.sh — 数据流关键词对账 (pre-commit 警告模式)
# 从 task brief 的"数据流"字段提取关键词，检查是否出现在改动代码中
# 缺失 → 警告（不阻断），提示 AI 检查数据流是否对齐
set -euo pipefail
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"
YELLOW='\033[1;33m'; GREEN='\033[0;32m'; RESET='\033[0m'

TODAY=$(date +%Y-%m-%d)
BRIEF=$(find .claude/task-briefs/ -name "${TODAY}*" 2>/dev/null | head -1)
if [ -z "$BRIEF" ]; then
  exit 0
fi

# 提取"数据流"字段内容，排除 HTML 注释
DATAFLOW=$(grep -A15 "数据流" "$BRIEF" 2>/dev/null | sed 's/<!--.*-->//g' | grep '→' | head -3 || true)
if [ -z "$DATAFLOW" ]; then
  exit 0
fi

# 提取 → 之间的关键词（取每个步骤的函数名或模块名）
KEYWORDS=$(echo "$DATAFLOW" | grep -oP '[a-zA-Z_][a-zA-Z0-9_.]*' | grep -v '^http$\|^api$\|^FDE$\|^Cron$\|^GET$\|^POST$\|^src$\|^GET$\|^POST$' | sort -u || true)
if [ -z "$KEYWORDS" ]; then
  exit 0
fi

# 获取改动文件列表
CHANGED=$(git diff --cached --name-only 2>/dev/null | grep '\.ts$' || git diff --name-only 2>/dev/null | grep '\.ts$' || true)
if [ -z "$CHANGED" ]; then
  exit 0
fi

MISSING=""
# 合并改动文件内容用于搜索
CHANGED_CONTENT=$(cat $CHANGED 2>/dev/null || true)

while IFS= read -r kw; do
  [ -z "$kw" ] && continue
  [ ${#kw} -lt 4 ] && continue  # 太短的关键词跳过
  if ! echo "$CHANGED_CONTENT" | grep -qi "$kw" 2>/dev/null; then
    MISSING="${MISSING}  $kw"
  fi
done <<< "$KEYWORDS"

if [ -n "$MISSING" ]; then
  echo -e "${YELLOW}⚠️  数据流对账: 以下关键词未在改动代码中找到:${RESET}"
  echo -e "${YELLOW}$MISSING${RESET}"
  echo -e "${YELLOW}  请确认数据流是否已对齐 task brief，若无需对齐可忽略。${RESET}"
fi

exit 0
