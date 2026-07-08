#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# hook-enforce-v25.sh — PreToolUse 物理强制 (Loop Engineering V4.4.4)
#
# 挂在 PreToolUse → Edit|Write 上，在 hook-block-write.sh 之后运行。
# 强制: 每轮 Write 前必须通过 verify-incremental.sh 验证。
#
# 物理强制逻辑 (零 AI 自律，零裁量):
#   .claude/loop-state.json 存在 → 上一轮验证未通过 → 物理阻断 Write
#   .claude/loop-state.json 不存在 → 允许继续
#
# 阻断信息包含: 阻断原因、已循环次数、修复指引
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
STATE_FILE="$ROOT/.claude/loop-state.json"

RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'

# ═══ 读取被阻止的文件名 (从 stdin JSON 或参数) ═══
INPUT=$(cat 2>/dev/null || echo '{}')
FILE=$(echo "$INPUT" | python3 -c "
import json,sys
try:
    data = json.load(sys.stdin)
    ti = data.get('tool_input', data)
    fp = ti.get('file_path', '') if isinstance(ti, dict) else ''
    print(fp)
except:
    print('')
" 2>/dev/null)

# ═══ 例外 ═══
# 允许写入 .claude/ 和 hooks/workflow 脚本本身 (避免鸡生蛋死锁)
if echo "$FILE" | grep -qE '\.claude/(task-briefs|settings|plans|specs|worktrees|loop-state)/'; then
  exit 0
fi
if echo "$FILE" | grep -qE 'scripts/(hooks|workflow)/hook-'; then
  exit 0
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 物理强制检查: loop-state.json 存在 = 上一轮验证失败
# ═══════════════════════════════════════════════════════════════════════════════
if [ -f "$STATE_FILE" ]; then
  # 读取循环状态
  ITER=$(python3 -c "
import json
try:
    d=json.load(open('$STATE_FILE'))
    print(d.get('iteration', '?'))
except:
    print('?')
" 2>/dev/null || echo "?")

  MAX=$(python3 -c "
import json
try:
    d=json.load(open('$STATE_FILE'))
    print(d.get('maxIterations', '?'))
except:
    print('?')
" 2>/dev/null || echo "?")

  echo ""
  echo -e "${RED}⛔ 物理阻断 — 上一轮验证未通过，禁止写代码${RESET}"
  echo ""
  echo -e "${YELLOW}  原因:${RESET}  verify-incremental.sh 上一轮退出非零"
  echo -e "${YELLOW}  本轮:${RESET}  $ITER / $MAX"
  echo -e "${YELLOW}  文件:${RESET}  $FILE"
  echo ""
  echo "  修复步骤:"
  echo "    1. 查看上面 verify-incremental.sh 的输出，定位失败原因"
  echo "    2. 修复代码 (L1 oxlint / L2 tsc / L3 测试 / L4 接线+架构+暗默)"
  echo "    3. 手动运行验证: bash scripts/workflow/verify-incremental.sh"
  echo "    4. 验证通过后，再重新 Write"
  echo ""
  echo -e "${CYAN}  提示: 如果已达上限 ($ITER/$MAX)，请人工介入${RESET}"
  echo ""
  exit 1
fi

# ═══ 一切正常，放行 ═══
exit 0
