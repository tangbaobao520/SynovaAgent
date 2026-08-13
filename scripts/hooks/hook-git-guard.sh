#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# hook-git-guard.sh — D312 git 操作写窗口守卫库 (M2)
#
# 08-02 stash 事故根因: git stash/pop 间隙被 PreToolUse hook 写仓库内文件
# （cp1-criteria.json / workflow-state.json / memory/*.md / STATE.md）→ pop 冲突。
#
# 本库: git 操作期间打开"写窗口"（TTL 标记文件），被写 hook source 后查询
# git_op_window_active → 跳过仓库内写文件。stash/checkout/reset 等命令结束
# 后 PostToolUse 调用 git_op_exit 关闭窗口。
#
# 设计原则（设计文档 §2.1.5 fail-open）: 标记文件写失败 → 打印 degraded 一行，
# 返回"窗口关闭"（即不跳过写）——宁可多写一次 checkpoint，绝不静默。
#
# 用法: 被 hook 脚本 source:
#   source "$(cd "$(dirname "$0")" && pwd)/../hooks/hook-git-guard.sh" 2>/dev/null || true
#   SKIP_HOOK_WRITES=0
#   if git_op_window_active; then SKIP_HOOK_WRITES=1; fi
# ═══════════════════════════════════════════════════════════════════════════════

HOOK_GIT_WINDOW_FILE="${HOOK_GIT_WINDOW_FILE:-.codex/control-tower/tmp/git-op-window.json}"
HOOK_GIT_WINDOW_TTL=300  # 秒 — 窗口超时自动失效（防孤儿标记卡死写 hook）

# ── 窗口是否激活（TTL 内且 type 合法）──
git_op_window_active() {
  local wf="$HOOK_GIT_WINDOW_FILE"
  [ -f "$wf" ] || return 1
  local ts
  ts=$(python3 -c "
import json, time, sys
try:
    d = json.load(open('$wf', encoding='utf-8'))
    print(d.get('entered_at', 0))
except Exception:
    print(0)
" 2>/dev/null || echo 0)
  [ "${ts:-0}" -gt 0 ] || return 1
  local now elapsed
  now=$(date +%s 2>/dev/null || echo 0)
  elapsed=$((now - ts))
  if [ "$elapsed" -lt 0 ] || [ "$elapsed" -gt "$HOOK_GIT_WINDOW_TTL" ]; then
    # 超时 → 清孤儿标记 + 返回关闭
    rm -f "$wf" 2>/dev/null || true
    return 1
  fi
  return 0
}

# ── 打开窗口（git 操作开始）──
git_op_enter() {
  local type="$1" cmd="$2"
  local wf="$HOOK_GIT_WINDOW_FILE"
  mkdir -p "$(dirname "$wf")" 2>/dev/null || {
    echo "[hook-git-guard] degraded: 无法创建窗口目录 $(dirname "$wf")" >&2
    return 1
  }
  local payload
  payload=$(python3 -c "
import json, sys
print(json.dumps({
    'type': '$type',
    'command': '''$cmd''',
    'entered_at': int(__import__('time').time()),
}, ensure_ascii=False))
" 2>/dev/null) || {
    echo "[hook-git-guard] degraded: 窗口标记序列化失败" >&2
    return 1
  }
  if ! echo "$payload" > "$wf" 2>/dev/null; then
    echo "[hook-git-guard] degraded: 无法写入窗口标记 $wf" >&2
    return 1
  fi
  return 0
}

# ── 关闭窗口（git 操作结束 / PostToolUse）──
git_op_exit() {
  rm -f "$HOOK_GIT_WINDOW_FILE" 2>/dev/null || {
    echo "[hook-git-guard] degraded: 无法清除窗口标记" >&2
    return 1
  }
  return 0
}
