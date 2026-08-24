#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# task-start.sh — Loop Engineering V4.5.1: 任务启动检查点
#
# 生成 task brief → D200 context-injector 注入权威文档上下文
#
# 用法:
#   bash scripts/workflow/task-start.sh "任务描述"
#   TASK_DESC="任务描述" bash scripts/workflow/task-start.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TASK_DESC="${*:-${TASK_DESC:-}}"

if [[ -z "$TASK_DESC" ]]; then
  echo "❌ 用法: bash scripts/workflow/task-start.sh \"任务描述\""
  exit 1
fi

# ═══ D515 项1: 并行隔离物理强制（Codex P1，三次复发）═══
# 主树有未提交改动 且 session-registry 有其他活跃 session → 硬拦截开工（exit 1）。
# 判定复用 synova-commit D507 段同一信号源（session_registry.py list --active）；
# registry 不可读 → 显式降级提示（铁律 11，不静默）；worktree 内 → 允许（本就物理隔离）。
# 测试注入: SYNO_SKIP_PARALLEL_GUARD=1 跳过本段（仅测试沙箱用）。
if [[ "${SYNO_SKIP_PARALLEL_GUARD:-0}" != "1" ]]; then
  _PAR_GITDIR="$(git -C "$PROJECT_ROOT" rev-parse --git-dir 2>/dev/null || echo '')"
  case "$_PAR_GITDIR" in
    *"/.git/worktrees/"*) : ;;  # worktree 内 → 物理隔离已成立，允许
    *)
      _PAR_DIRTY="$(git -C "$PROJECT_ROOT" status --porcelain 2>/dev/null | head -1 || true)"
      if [[ -n "$_PAR_DIRTY" && -f "$PROJECT_ROOT/scripts/control-tower/session_registry.py" ]]; then
        _PAR_ACT="$(python3 "$PROJECT_ROOT/scripts/control-tower/session_registry.py" list --active </dev/null 2>/dev/null || true)"
        if [[ -z "$_PAR_ACT" ]]; then
          echo "⚠ session-registry 不可读 — 并行检查降级放行（铁律 11，不静默）"
        else
          _PAR_N="$(echo "$_PAR_ACT" | python3 -c "import json,sys;print(len(json.load(sys.stdin).get('sessions',[])))" 2>/dev/null | tr -d '

' || echo "")"  # swallow-ok: 解析失败 → 空 → 跳过拦截（单人语义）
          if [[ -n "$_PAR_N" && "$_PAR_N" -gt 0 ]]; then
            echo "❌ 主树有未提交改动，且 registry 有 ${_PAR_N} 个活跃 session — 并行互踩风险（Codex P1）"
            echo "   请在专属 worktree 开工:"
            echo "     python3 scripts/control-tower/worktree-manager.py create <任务名>"
            echo "     cd ../synova-wt-<任务名>"
            exit 1
          fi
        fi
      fi
      ;;
  esac
fi

# 生成 task brief
TODAY=$(date +%Y-%m-%d)
TASK_ID="${TASK_ID:-${TODAY}-auto}"
BRIEF_FILE="$PROJECT_ROOT/.claude/task-briefs/${TASK_ID}.md"

export BRIEF_FILE TASK_DESC
python3 "$SCRIPT_DIR/generate-task-brief.py"

echo "✅ Task brief 已生成: $BRIEF_FILE"
# D513/⑤: 恢复写 current-brief —— Claude Code 线 attach 依赖此文件定位当前 brief；
# 停写后陈旧指向有 G12 误伤风险（Win 8f33e82a 观察）。取最新 mtime 防多 brief 挑错。
LATEST_BRIEF=$(ls -t "$PROJECT_ROOT/.claude/task-briefs/"*.md 2>/dev/null | head -1)  # swallow-ok: 目录空 → 跳过
[ -n "$LATEST_BRIEF" ] && basename "$LATEST_BRIEF" > "$PROJECT_ROOT/.claude/current-brief"

# D284-FIX: task-start 完成后清除 session-locked（不依赖 hook 触发）
rm -f "$PROJECT_ROOT/.claude/session-locked" 2>/dev/null
echo "✅ session-locked 已清除"

# D200: 上下文注射 — 注入权威文档上下文到 Q1c 字段
INJECTOR="$PROJECT_ROOT/scripts/control-tower/context-injector.sh"
if [[ -f "$INJECTOR" ]]; then
  bash "$INJECTOR" --task-id "$TASK_ID" && echo "✅ 上下文注射完成" || echo "⚠ 上下文注射降级"
else
  echo "⚠ context-injector.sh 未找到 — 跳过注射"
fi
