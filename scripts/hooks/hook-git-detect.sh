#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# hook-git-detect.sh — D312 hook 识别 git 操作 + 禁 stash 铁律 (M2)
#
# 挂载: .claude/settings.json + .codex/hooks.json
#   PreToolUse  matcher "Bash"  → hook-git-detect.sh
#   PostToolUse matcher "Bash"  → hook-git-detect.sh --post
#
# 职责:
#   1. 识别 git stash / checkout / reset / revert / merge / clean / restore / switch
#   2. stash → ban 提示（替代方案: baseline-check.sh / worktree / synova-commit）
#   3. git 操作 → 打开写窗口（hook-git-guard.sh），让写 hook 跳过仓库内写文件
#   4. --post → 关闭窗口
#
# 原则（铁律 24+31 + 设计文档 §2.1.5）: 全部 exit 0 永不阻断业务；
# 解析失败 → 静默无副作用（fail-open）；窗口写失败 → degraded 一行不静默。
#
# 用法: hook-git-detect.sh [--post]   (stdin: Claude Code hook JSON)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/hook-git-guard.sh" 2>/dev/null || true

POST_MODE=0
[ "${1:-}" = "--post" ] && POST_MODE=1

# ── 从 stdin 解析 tool_input.command（与 hook-block-write.sh 同构）──
INPUT=$(cat 2>/dev/null || echo '{}')
# D564: python 解析——优先 SYNO_PYTHON（incident-loop.py _bash_env 显式注入的确定
# 可用解释器；Windows hostedtoolcache 无 python3.exe 且 WindowsApps python3 为
# Store 占位 stub 时，PATH 解析拿到坏 shim → 本 hook 静默 exit 0（fail-open）→
# verify 误报 open，CI 实测 6/8）。未注入时回落 PATH python3（D312 原行为不变）。
PY_BIN="${SYNO_PYTHON:-}"
if [ -z "$PY_BIN" ]; then
  PY_BIN="$(command -v python3 2>/dev/null || true)"
fi
COMMAND=$(echo "$INPUT" | ${PY_BIN:+"$PY_BIN"} -c "
import json, sys
try:
    data = json.load(sys.stdin)
    ti = data.get('tool_input', data)
    cmd = ti.get('command', '') if isinstance(ti, dict) else ''
    print(cmd)
except Exception:
    print('')
" 2>/dev/null || echo "")

# ── PostToolUse: 关闭窗口 ──
if [ "$POST_MODE" -eq 1 ]; then
  if [ -f "$HOOK_GIT_WINDOW_FILE" ]; then
    git_op_exit 2>/dev/null || true
    echo "[hook-git-detect] git 操作窗口已关闭 — hook 仓库写文件恢复"
  fi
  exit 0
fi

[ -z "$COMMAND" ] && exit 0  # 非 Bash 工具或无命令 → fail-open 无副作用

# ── 分类判定（词边界，防 git status/stash list 误命中）──
# stash list 是只读计数（pre-doc-audit.sh 使用），例外放行
if echo "$COMMAND" | grep -qE '\bgit[[:space:]]+stash[[:space:]]+list([[:space:]]|$)'; then
  exit 0
fi
IS_STASH=0
if echo "$COMMAND" | grep -qE '\bgit[[:space:]]+stash([[:space:]]|$)'; then
  IS_STASH=1
fi
IS_GITOP=0
if echo "$COMMAND" | grep -qE '\bgit[[:space:]]+(checkout|reset|revert|merge|clean|restore|switch)([[:space:]]|$)'; then
  IS_GITOP=1
fi

if [ "$IS_STASH" -eq 1 ]; then
  echo "[hook-git-detect] 检测到 git stash — 08-02 事故禁止使用（stash/pop 间隙被 hook 写文件导致 pop 冲突）"
  echo "   替代方案:"
  echo "   1) 查看基线:   bash scripts/control-tower/baseline-check.sh"
  echo "   2) 隔离工作区: git worktree add ../synova-wt-<任务名> <branch>"
  echo "   3) 保存进度:   先 git commit（走 synova-commit），不要 stash"
  echo "   说明: 本次命令执行期间 hook 已跳过所有仓库内写文件（含 checkpoint/memory/state）"
  git_op_enter stash "$COMMAND" 2>/dev/null || true
  exit 0
elif [ "$IS_GITOP" -eq 1 ]; then
  echo "[hook-git-detect] git 操作 ${COMMAND} — hook 仓库写文件跳过（窗口 ${HOOK_GIT_WINDOW_TTL}s）"
  git_op_enter gitop "$COMMAND" 2>/dev/null || true
  exit 0
fi

exit 0
