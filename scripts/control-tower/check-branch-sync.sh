#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# check-branch-sync.sh — D335 提交端同步门禁 (开工/提交物理强制)
#
# 背景: D334 在 push 端加了同步检查（落后/分叉才拦），但"开工时刻"仍靠 agent
#       自觉（软机制）。V3.9 教训: 硬阻断 100% 有效, 软机制 0% 有效。
#       本脚本挂载 synova-commit（提交唯一路径），提交前物理验证当前分支
#       相对远端 main 的同步状态——过期分支上的提交被当场拦下。
#
# 规则:
#   1. 当前分支 = main: 落后远端 main → 🔴 阻断 (先 git pull --ff-only)
#   2. 当前分支 = 其他(feat/等): 远端 main 有本地历史没有的提交 → 🔴 阻断
#      (先 git fetch && git rebase origin/main —— PR 工作流标准动作)
#   3. 分叉(双向都有新提交): 同样阻断 (禁止在过期基线上继续提交)
#   4. 逃生舱: SYNO_SKIP_BRANCH_SYNC=1 (需创始人批准, 记 degraded 日志)
# 降级: fetch 失败(离线) → fail-open 显式提示 (不静默 — 铁律 11)
# 测试注入: SYNO_BRANCH_SYNC_ONLY=1 只跑本检查 (branch-sync-guard.test.sh 单测)
#
# 用法: bash check-branch-sync.sh [remote] [main-branch]
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE="${1:-origin}"
MAIN_BRANCH="${2:-main}"
DEGRADED_LOG="$(git rev-parse --show-toplevel 2>/dev/null || echo "$SCRIPT_DIR/../..")/.codex/control-tower/logs/degraded-events.log"

log_degraded() { # <reason>
  mkdir -p "$(dirname "$DEGRADED_LOG")" 2>/dev/null || true
  echo "{\"time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"component\": \"check-branch-sync\", \"reason\": \"$1\"}" >> "$DEGRADED_LOG" 2>/dev/null || true
}

check_branch_sync() {
  local current="" behind="0" ahead="0" fremote="$REMOTE" fmain="$MAIN_BRANCH"

  # 逃生舱
  if [[ "${SYNO_SKIP_BRANCH_SYNC:-}" == "1" ]]; then
    echo -e "  ${YELLOW}⚠️  SYNO_SKIP_BRANCH_SYNC=1 逃生舱生效 — 同步检查跳过 (已记 degraded)${RESET}"
    log_degraded "skip via SYNO_SKIP_BRANCH_SYNC=1"
    return 0
  fi

  current="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
  if [[ -z "$current" ]]; then
    echo -e "  ${YELLOW}⚠️  无法确定当前分支 — 同步检查跳过 (fail-open)${RESET}"
    return 0
  fi

  # fetch 远端 main (窄 fetch, 只更新 FETCH_HEAD 不碰工作区)
  if ! git fetch "$fremote" "$fmain" --quiet 2>/dev/null; then # swallow-ok: fetch 失败走 fail-open 显式提示 (铁律 11)
    echo -e "  ${YELLOW}⚠️  fetch $fremote $fmain 失败 — 同步检查跳过 (fail-open, 离线环境)${RESET}"
    log_degraded "fetch $fremote $fmain failed"
    return 0
  fi

  behind="$(git rev-list --count HEAD..FETCH_HEAD 2>/dev/null | tr -d '\n\r' || echo "0")"
  ahead="$(git rev-list --count FETCH_HEAD..HEAD 2>/dev/null | tr -d '\n\r' || echo "0")"
  [[ -z "$behind" ]] && behind="0"
  [[ -z "$ahead" ]] && ahead="0"

  if [[ "$current" == "$fmain" ]]; then
    # 规则 1: 在 main 上提交, 但远端 main 有新提交
    if [[ "$behind" -gt 0 ]]; then
      echo -e "  ${RED}❌ 分支同步: 远端 main 有 $behind 个本机没有的 commit — 当前 main 已过期${RESET}"
      echo "  先拉平再提交:"
      echo "    git pull --ff-only"
      return 1
    fi
    echo -e "  ${GREEN}✅ 分支同步: main 与远端一致 (本地领先 $ahead)${RESET}"
    return 0
  fi

  # 规则 2/3: 非 main 分支 — 远端 main 有本地历史没有的提交 → 过期基线
  if [[ "$behind" -gt 0 ]]; then
    if [[ "$ahead" -gt 0 ]]; then
      echo -e "  ${RED}❌ 分支同步: 与 main 分叉 — 本地领先 $ahead / main 有新提交 $behind${RESET}"
      echo "  禁止在过期基线上提交。先集成 main:"
      echo "    git fetch $fremote && git rebase $fremote/$fmain"
    else
      echo -e "  ${RED}❌ 分支同步: main 有 $behind 个本分支没有的 commit — 基线已过期${RESET}"
      echo "  先拉平再提交:"
      echo "    git fetch $fremote && git rebase $fremote/$fmain"
    fi
    return 1
  fi

  echo -e "  ${GREEN}✅ 分支同步: 基于最新 main (本地领先 $ahead)${RESET}"
  return 0
}

# 测试注入: 只跑本检查
if [[ "${SYNO_BRANCH_SYNC_ONLY:-}" == "1" ]]; then
  set +e
  check_branch_sync
  EC=$?
  set -e
  exit "$EC"
fi

echo -e "${CYAN}── 分支同步检查 (D335) ─────────────────────────────${RESET}"
set +e
check_branch_sync
EC=$?
set -e
if [[ "$EC" -ne 0 ]]; then
  echo ""
  echo -e "  ${RED}❌ 分支同步检查未通过 — 提交已拒绝 (D335)${RESET}"
  exit 1
fi
