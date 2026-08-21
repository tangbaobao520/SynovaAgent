#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# check-orphan-worktrees.sh — worktree 收尾检测（2026-08-21 控制塔冻结决策·必修项）
#
# 背景: D402/D445 的实现躺在 worktree 分支上没合并进 main，task-state 标"待实现"
#       但实际早写好——worktree 隔离解决了并发冲突，也隔离了交付（没人收尾）。
#       本脚本检测"孤儿 worktree"：session 已结束（pid 空）但 worktree 还在、分支未合并。
#
# 契约:
#   @input  — 无参 | --json（输出 JSON）
#   @output — 列出孤儿 worktree（path/分支/独有提交数）+ exit 1（有孤儿）
#   @exit   — 0 无孤儿；1 有孤儿（CTO 需处理收尾）；2 降级（git 不可用）
#   @degraded — git 不可用 → exit 2 + 显式 log（铁律 11）
#
# 判定: worktree 的 HEAD 不在 origin/main 历史（有独有提交）→ 待收尾（该合并或确认过时）
#       且 session 已结束（pid 空）→ 孤儿（没人会主动收尾）
#
# 用法: bash scripts/control-tower/check-orphan-worktrees.sh [--json]
# 集成: gen-cto-health.py 渲染前调用（CTO 开工可见孤儿 worktree 清单）
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REGISTRY="$ROOT/.codex/control-tower/session-registry.json"

JSON_OUT=false
[ "${1:-}" = "--json" ] && JSON_OUT=true

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

# ── git worktree 可用性 ──
if ! git -C "$ROOT" worktree list >/dev/null 2>&1; then  # swallow-ok: 非 git 仓库/损坏，降级
  echo -e "${YELLOW}⚠ worktree 检测降级: git 不可用${NC}" >&2
  echo "degraded: git worktree list 失败" >&2
  exit 2
fi

# ── 收集所有 worktree（排除主 worktree）──
ORPHANS=""
COUNT=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  # porcelain 格式: worktree <path> / HEAD <sha> / branch <ref>
  if [[ "$line" == worktree\ * ]]; then
    WT_PATH="${line#worktree }"
    # 主 worktree（仓库根）不是孤儿
    if [ "$WT_PATH" = "$ROOT" ]; then
      continue
    fi
  elif [[ "$line" == branch\ * ]]; then
    WT_BRANCH="${line#branch }"
    # 检查该分支是否有未合并到 origin/main 的独有提交
    UNMERGED=$(git -C "$ROOT" rev-list --count origin/main.."$WT_BRANCH" 2>/dev/null || echo "0")
    if [ "$UNMERGED" -gt 0 ] 2>/dev/null; then
      # 有独有提交 → 待收尾（可能是真交付没合并，也可能过时）
      COUNT=$((COUNT+1))
      if [ "$JSON_OUT" = true ]; then
        ORPHANS="${ORPHANS}${ORPHANS:+,}{\"path\":\"$WT_PATH\",\"branch\":\"$WT_BRANCH\",\"unmerged\":$UNMERGED}"
      else
        ORPHANS="${ORPHANS}  - ${WT_PATH} (分支 ${WT_BRANCH}, ${UNMERGED} 个独有提交待收尾)\n"
      fi
    fi
  fi
done < <(git -C "$ROOT" worktree list --porcelain 2>/dev/null)

if [ "$JSON_OUT" = true ]; then
  echo "{\"orphan_count\":$COUNT,\"orphans\":[$ORPHANS]}"
else
  if [ "$COUNT" -gt 0 ]; then
    echo -e "${RED}❌ worktree 收尾: $COUNT 个孤儿 worktree 有待收尾（实现可能躺分支未合并）${NC}"
    echo -e "$ORPHANS"
    echo "  处理: 确认独有提交是否该合并（真交付）→ worktree-manager finish 或 merge 进 main；过时则删除"
  else
    echo -e "${GREEN}✅ worktree 收尾: 无孤儿 worktree${NC}"
  fi
fi
[ "$COUNT" -gt 0 ] && exit 1 || exit 0
