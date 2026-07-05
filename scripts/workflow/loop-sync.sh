 #!/bin/bash
# Loop Engineering V4.4.1 — STATE.md ↔ LOOP.md 漂移检测 + worktree push
#
# 用法:
#   bash scripts/workflow/loop-sync.sh              — 漂移检测 (默认)
#   bash scripts/workflow/loop-sync.sh push          — 推当前 worktree 到 session 分支
#   bash scripts/workflow/loop-sync.sh push --force  — 强制推 (--force-with-lease)
 # Loop Engineering V4.4.1 — STATE.md ↔ LOOP.md 漂移检测
 #
 # 检查 LOOP.md 中声明的活跃循环是否与实际 Git hooks / 脚本匹配。
 # 检查 STATE.md 的 Active Task 字段格式是否正确。
 # 退出 0 = 一致, 退出 1 = 检测到漂移 (警告, 不阻断)。
 #
 # 用法: bash scripts/workflow/loop-sync.sh
 
 set -euo pipefail
 
 RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'
 SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
 ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
 
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
   # Task Start
   if [ -f "$ROOT/scripts/workflow/task-start.sh" ]; then
     echo -e "  ${GREEN}task-start.sh 存在${RESET}"
   else
     echo -e "  ${RED}LOOP.md 声明 Task Start 但 task-start.sh 缺失${RESET}"
     DRIFT=1
   fi
 
   # Verify Incremental
   if [ -f "$ROOT/scripts/workflow/verify-incremental.sh" ]; then
     echo -e "  ${GREEN}verify-incremental.sh 存在${RESET}"
   else
     echo -e "  ${RED}LOOP.md 声明 Verify Incremental 但 verify-incremental.sh 缺失${RESET}"
     DRIFT=1
   fi
 
   # Pre-Commit
   if [ -f "$ROOT/.git/hooks/pre-commit" ] || [ -f "$ROOT/scripts/pre-commit-check.sh" ]; then
     echo -e "  ${GREEN}pre-commit hook 存在${RESET}"
   else
     echo -e "  ${RED}LOOP.md 声明 Pre-Commit 但 hook 缺失${RESET}"
     DRIFT=1
   fi
 
   # Pre-Push
   if [ -f "$ROOT/.git/hooks/pre-push" ] || [ -f "$ROOT/scripts/pre-push-check.sh" ]; then
     echo -e "  ${GREEN}pre-push hook 存在${RESET}"
   else
     echo -e "  ${RED}LOOP.md 声明 Pre-Push 但 hook 缺失${RESET}"
     DRIFT=1
   fi
 
   # Post-Deploy
   if [ -f "$ROOT/scripts/workflow/checkpoint-deploy.sh" ]; then
     echo -e "  ${GREEN}checkpoint-deploy.sh 存在${RESET}"
   else
     echo -e "  ${YELLOW}LOOP.md 声明 Post-Deploy 但 checkpoint-deploy.sh 缺失 (可能未部署)${RESET}"
   fi
 
   # Runtime Monitor
   if [ -f "$ROOT/scripts/workflow/checkpoint-runtime.sh" ]; then
     echo -e "  ${GREEN}checkpoint-runtime.sh 存在${RESET}"
   else
     echo -e "  ${YELLOW}LOOP.md 声明 Runtime Monitor 但 checkpoint-runtime.sh 缺失 (可能未配置 cron)${RESET}"
   fi
 fi
 
 # 4. STATE.md Active Task 格式检查
 if [ -f "$ROOT/STATE.md" ]; then
   ACTIVE_TASK=$(grep "^| Active Task" "$ROOT/STATE.md" 2>/dev/null || true)
   if [ -n "$ACTIVE_TASK" ]; then
     echo -e "  ${GREEN}STATE.md Active Task 行存在${RESET}"
   else
     echo -e "  ${YELLOW}STATE.md 缺少 Active Task 行 (task-start.sh 运行时自动填充)${RESET}"
   fi
 fi
 
 echo ""
 if [ "$DRIFT" -gt 0 ]; then
   echo -e "${RED}检测到 ${DRIFT} 处漂移。请更新 LOOP.md 或安装缺失的脚本/hooks。${RESET}"
   exit 1
 else
   echo -e "${GREEN}STATE.md ↔ LOOP.md 一致。${RESET}"
   exit 0
 fi

# ═══ push 模式: 推当前 worktree 到 session 分支 ═══
if [ "${1:-}" = "push" ]; then
  FORCE="${2:-}"
  ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
  CURRENT_DIR=$(pwd)

  # 检测 worktree session 名
  SESSION_NAME=$(echo "$CURRENT_DIR" | grep -oP 'session\+?\w+' | head -1 || true)
  if [ -z "$SESSION_NAME" ]; then
    SESSION_NAME=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
  fi

  # 映射 worktree 目录名到 session 分支名
  case "$SESSION_NAME" in
    session+03) BRANCH="session/03" ;;
    session+*) BRANCH="session/${SESSION_NAME#session+}" ;;
    *) BRANCH="$SESSION_NAME" ;;
  esac

  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "  Loop Engineering V4.4.1 — worktree → session 分支推送"
  echo "═══════════════════════════════════════════════════════════"
  echo ""
  echo "  Worktree: $SESSION_NAME"
  echo "  推送至:   $BRANCH"
  echo ""

  # 检查是否有未推送的 commit
  LOCAL_ONLY=$(git log "origin/$BRANCH..HEAD" --oneline 2>/dev/null | wc -l || echo "0")
  if [ "$LOCAL_ONLY" -gt 0 ]; then
    echo "  本地领先远端 $LOCAL_ONLY 个 commit:"
    git log "origin/$BRANCH..HEAD" --oneline | head -5
    echo ""
  fi

  # 推送
  PUSH_CMD="git push origin HEAD:$BRANCH"
  if [ "$FORCE" = "--force" ]; then
    PUSH_CMD="git push --force-with-lease origin HEAD:$BRANCH"
    echo "  使用 --force-with-lease"
  fi

  echo "  执行: $PUSH_CMD"
  eval "$PUSH_CMD"

  echo ""
  echo "  推送完成。在 GitHub 上:"
  echo "    https://github.com/tangbaobao520/SynovaAgent/pull/new/$BRANCH"
  echo "  提 PR: $BRANCH → feat/prompt-architecture"
  exit $?
fi

# ═══ 以下是漂移检测逻辑 ═══
