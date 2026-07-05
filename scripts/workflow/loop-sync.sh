#!/bin/bash
# Loop Engineering V4.4.1 — 漂移检测 + worktree push
#
# 用法:
#   bash scripts/workflow/loop-sync.sh              — 漂移检测 (默认)
#   bash scripts/workflow/loop-sync.sh push          — 推当前 worktree 到 session 分支
#   bash scripts/workflow/loop-sync.sh push --force  — 强制推 (--force-with-lease)

set -euo pipefail
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ═══ push 模式: 推当前 worktree 到 session 分支 ═══
if [ "${1:-}" = "push" ]; then
  FORCE="${2:-}"
  CURRENT_DIR=$(pwd)

  SESSION_NAME=$(echo "$CURRENT_DIR" | grep -oP 'session\+?\w+' | head -1 || true)
  if [ -z "$SESSION_NAME" ]; then
    SESSION_NAME=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
  fi

  case "$SESSION_NAME" in
    session+03) BRANCH="session/03" ;;
    session+*) BRANCH="session/${SESSION_NAME#session+}" ;;
    *) BRANCH="$SESSION_NAME" ;;
  esac

  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "  Loop Engineering V4.4.1 — worktree → session 分支推送"
  echo "═══════════════════════════════════════════════════════════"
  echo "  Worktree: $SESSION_NAME → 推送至: $BRANCH"
  echo ""

  LOCAL_ONLY=$(git log "origin/$BRANCH..HEAD" --oneline 2>/dev/null | wc -l || echo "0")
  if [ "$LOCAL_ONLY" -gt 0 ]; then
    echo "  本地领先远端 $LOCAL_ONLY 个 commit:"
    git log "origin/$BRANCH..HEAD" --oneline | head -3
    echo ""
  fi

  PUSH_CMD="git push origin HEAD:$BRANCH"
  if [ "$FORCE" = "--force" ]; then
    PUSH_CMD="git push --force-with-lease origin HEAD:$BRANCH"
  fi

  echo "  执行: $PUSH_CMD"
  eval "$PUSH_CMD"
  echo ""
  echo "  推送完成。创建 PR:"
  echo "    https://github.com/tangbaobao520/SynovaAgent/compare/$BRANCH?expand=1"
  exit $?
fi

# ═══ 以下是漂移检测逻辑 ═══

DRIFT=0

echo ""
echo -e "${CYAN}Loop Engineering V4.4.1 — STATE.md ↔ LOOP.md 漂移检测${RESET}"
echo ""

# 1. LOOP.md 存在性
if [ ! -f "$ROOT/LOOP.md" ]; then
  echo -e "  ${RED}缺失: LOOP.md${RESET}"
  DRIFT=1
else
  echo -e "  ${GREEN}LOOP.md 存在${RESET}"
fi

# 2. STATE.md 存在性
if [ ! -f "$ROOT/STATE.md" ]; then
  echo -e "  ${RED}缺失: STATE.md${RESET}"
  DRIFT=1
else
  echo -e "  ${GREEN}STATE.md 存在${RESET}"
fi

# 3. LOOP.md 中声明的活跃循环 vs 实际脚本
if [ -f "$ROOT/LOOP.md" ]; then
  for script in task-start.sh verify-incremental.sh checkpoint-deploy.sh checkpoint-runtime.sh; do
    if [ -f "$ROOT/scripts/workflow/$script" ]; then
      echo -e "  ${GREEN}$script 存在${RESET}"
    else
      echo -e "  ${RED}LOOP.md 声明但 $script 缺失${RESET}"
      DRIFT=1
    fi
  done
  if [ -f "$ROOT/.git/hooks/pre-commit" ] || [ -f "$ROOT/scripts/pre-commit-check.sh" ]; then
    echo -e "  ${GREEN}pre-commit hook 存在${RESET}"
  else
    echo -e "  ${RED}pre-commit hook 缺失${RESET}"
    DRIFT=1
  fi
  if [ -f "$ROOT/.git/hooks/pre-push" ] || [ -f "$ROOT/scripts/pre-push-check.sh" ]; then
    echo -e "  ${GREEN}pre-push hook 存在${RESET}"
  else
    echo -e "  ${RED}pre-push hook 缺失${RESET}"
    DRIFT=1
  fi
fi

# 4. STATE.md Active Task 格式检查
if [ -f "$ROOT/STATE.md" ] && ! grep -q "^| Active Task" "$ROOT/STATE.md" 2>/dev/null; then
  echo -e "  ${YELLOW}STATE.md 缺少 Active Task 行${RESET}"
fi

echo ""
if [ "$DRIFT" -gt 0 ]; then
  echo -e "${RED}检测到 ${DRIFT} 处漂移。请更新 LOOP.md 或安装缺失的脚本。${RESET}"
  exit 1
else
  echo -e "${GREEN}STATE.md ↔ LOOP.md 一致。${RESET}"
  exit 0
fi
