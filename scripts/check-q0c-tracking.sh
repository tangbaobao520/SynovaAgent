#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Loop Engineering V4.5.0 — check-q0c-tracking.sh
# Q0c 取消跟踪。pre-commit 第 6 组调用。全部 <1s。
#
# Anthropic 原则: 冲突→取消是正确的。但取消产生缺口——必须有人追。
# 如果 plan.json 中有 status: cancelled 的任务但无 follow_up，不准提交。
# ═══════════════════════════════════════════════════════════════════════════════
set +e

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
RED='\033[0;31m'; GREEN='\033[0;32m'; RESET='\033[0m'

PLAN_FILE="$ROOT/.claude/plan.json"

if [ ! -f "$PLAN_FILE" ]; then
  echo -e "  ${GREEN}✅ Q0c 跟踪 (无 plan.json)${RESET}"
  exit 0
fi

UNTRAACKED=$(python3 -c "
import json,sys
try:
  p = json.load(open('$PLAN_FILE'))
  untracked = []
  for ph in p.get('phases', []):
    if ph.get('action') in ('cancel', 'cancelled'):
      if not ph.get('follow_up'):
        untracked.append(ph.get('task', ph.get('step', 'unknown')))
  for t in untracked:
    print(t)
except: pass
" 2>/dev/null)

if [ -n "$UNTRAACKED" ]; then
  COUNT=$(echo "$UNTRAACKED" | grep -c .)
  echo -e "  ${RED}❌ Q0c 跟踪: ${COUNT} 项取消但无 follow_up  [硬阻断]${RESET}"
  echo "$UNTRAACKED" | while read -r t; do echo "    - $t: 必须填写 follow_up 字段说明谁在什么时候补完"; done
  echo "    plan.json 格式: { \"step\": 1, \"action\": \"cancel\", \"follow_up\": \"Batch-X 实现 xxx 文件驱动替代\" }"
  exit 1
else
  echo -e "  ${GREEN}✅ Q0c 跟踪${RESET}"
  exit 0
fi
