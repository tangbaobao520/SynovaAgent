#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# sop-gate.sh — U6/D416 Mac DSH SOP 步骤物理卡点
#
# 背景: Mac DSH 无 PreToolUse/PostToolUse hook（persona-block.yml:105），流程纪律靠自觉 →
#       M2/M4/M7 过程产物漏（D391/D393 FAIL 根因）。本脚本把 8 步 SOP 的关键步骤
#       从"请自觉"升级为"机器卡点"——每步必须物理证据齐全才放行。
#
# 契约 (铁律 47):
#   @input  — --step <2|5|7> [--brief <name>]（无注入缝；测试在真实 task-briefs 目录建临时文件 + trap 清理）
#   @output — 该步骤物理证据校验报告 + 缺失时的补救命令
#   @exit   — 0 = 该步证据齐全可进下一步；1 = 证据缺失（阻断 + 补救提示）；
#             2 = 校验执行失败/降级（环境不可用等）
#   @degraded — exit 2 + stderr "degraded: <原因>"（铁律 11 显式降级）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
STEP=""
BRIEF=""
while [ $# -gt 0 ]; do
  case "$1" in
    --step) STEP="${2:-}"; shift 2 ;;
    --brief) BRIEF="${2:-}"; shift 2 ;;
    *) shift ;;
  esac
done

fail() { echo "  ❌ step $STEP 证据缺失: $1"; echo "     补救: $2"; exit 1; }

# ── 解析 brief 路径（--brief 指定 / current-brief / 今日最新）──
resolve_brief() {
  if [ -n "$BRIEF" ]; then [ -f "$ROOT/.claude/task-briefs/$BRIEF" ] && echo "$ROOT/.claude/task-briefs/$BRIEF"; return; fi
  # CT-42: session 专属 current-brief 优先，无则回退全局
  _cb_src="$ROOT/.claude/current-brief"
  if [ -n "${DSH_SESSION_ID:-}" ] && [ -f "$ROOT/.claude/current-brief.$DSH_SESSION_ID" ]; then
    _cb_src="$ROOT/.claude/current-brief.$DSH_SESSION_ID"
  fi
  if [ -f "$_cb_src" ]; then
    bn=$(cat "$_cb_src" 2>/dev/null | tr -d '[:space:]' || true)  # swallow-ok: current-brief 可缺失, 回退今日最新 brief
    [ -n "$bn" ] && [ -f "$ROOT/.claude/task-briefs/$bn" ] && { echo "$ROOT/.claude/task-briefs/$bn"; return; }
  fi
  ls -t "$ROOT"/.claude/task-briefs/*.md 2>/dev/null | head -1 || true  # swallow-ok: 无 brief 时返回空, 调用方判空
}

case "$STEP" in
  2)
    # brief 完成: 存在 + 6 核心字段非空
    B=$(resolve_brief)
    [ -z "$B" ] || [ ! -f "$B" ] && fail "task brief 不存在" "bash scripts/workflow/task-start.sh 生成并填写 6 字段"
    for sec in "## Q0" "## Q1" "## Q2" "## Q3" "架构层" "Done 标准"; do
      grep -q "$sec" "$B" || fail "brief 缺字段: $sec" "填写 $B 的 $sec 节"
    done
    echo "SYNC-OK: step 2 brief 完整 ($B)"
    ;;
  5)
    # verify 完成: 增量验证通过（无未解决失败）
    if [ ! -d "$ROOT/node_modules" ]; then
      echo "degraded: node_modules 缺失, 无法跑增量验证 (code=SOP_GATE_ERROR, phase=verify, retryable=true)" >&2
      exit 2
    fi
    if bash "$ROOT/scripts/workflow/verify-incremental.sh" >/dev/null 2>&1; then
      echo "SYNC-OK: step 5 verify-incremental 通过"
    else
      fail "verify-incremental 未通过" "bash scripts/workflow/verify-incremental.sh 看哪层失败"
    fi
    ;;
  7)
    # 可提交: bypass.log 无未提交变更（证据链入库, U1a）
    if ! git -C "$ROOT" diff --quiet -- .claude/bypass.log 2>/dev/null; then  # swallow-ok: 探测 bypass.log 变更状态（探测型, 非吞错）
      fail "bypass.log 有未提交变更（证据链未入库）" "git add .claude/bypass.log 一并提交"
    fi
    echo "SYNC-OK: step 7 bypass.log 证据链已入库"
    ;;
  *)
    echo "用法: sop-gate.sh --step <2|5|7> [--brief <name>]" >&2
    exit 2
    ;;
esac
exit 0
