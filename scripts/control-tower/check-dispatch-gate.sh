#!/usr/bin/env bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# check-dispatch-gate.sh — D778 派单文档强制复核门禁
#
# 背景（D778 实测）: pre-dispatch-check.sh 只在人工想起时跑，没人跑也不拦
#   （创始人 2026-09-15「产出交付前必须复核，流程要固化下来」）。本脚本把
#   复核变成 pre-commit 的物理环节: staged 派单文档必须过 pre-dispatch-check。
#
# 用法:
#   bash scripts/control-tower/check-dispatch-gate.sh [派单文档路径...]
#   无参数时自动探测暂存区 docs/synova/coordination/派单-*.md（生产路径）
#
# 契约 (铁律 47):
#   @input  — 文档列表三优先级: ① SYNO_PRE_DISPATCH_DOCS（换行分隔，测试注入缝——
#             只能加不能减: 置空 = 视为未注入，回退探测，fail-closed）
#             ② 命令行参数 ③ git diff --cached 自动探测（ACMR，派单-*.md 精确 glob）
#             复核脚本: SYNO_PRE_DISPATCH_BIN 覆盖（默认同目录 pre-dispatch-check.sh）
#   @output — 逐文档 ✅/❌/degraded 点名 + 尾行 GATE-OK / GATE-FAIL / GATE-DEGRADED 标记
#   @exit   — 0 = 无派单文档(跳过) 或全部复核通过
#             1 = 存在复核未过的派单文档（pre-dispatch-check exit 1: 缺 task-state/
#                 写集路径不存在/未锚定计划/缺自检段等）
#             2 = 门禁降级（复核脚本缺失 / 复核脚本自身 exit 2——文档不存在、非 git 仓库）
#   @degraded — exit 2 + 显式 "degraded:" 行（铁律 11——显式留痕，绝不静默当绿）
#   @性能   — 无派单文档 <1s 跳过（V4.5.1 教训: pre-commit 超时 = --no-verify = 门禁链失效）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
BIN="${SYNO_PRE_DISPATCH_BIN:-$SCRIPT_DIR/pre-dispatch-check.sh}"

# 文档集合解析（三优先级，见契约 @input）
DOCS="${SYNO_PRE_DISPATCH_DOCS:-}"
if [ -z "$DOCS" ] && [ "$#" -gt 0 ]; then DOCS="$*"; fi
if [ -z "$DOCS" ]; then
  DOCS=$(git -c core.quotepath=false diff --cached --name-only --diff-filter=ACMR 2>/dev/null \
    | grep -E '^docs/synova/coordination/派单-[^/]+\.md$' || true)
fi

if [ -z "$DOCS" ]; then
  echo "GATE-OK: 无派单文档变更(跳过)"
  exit 0
fi

if [ ! -f "$BIN" ]; then
  echo "degraded: 复核脚本缺失: $BIN — 派单文档未经复核，禁止静默放行"
  echo "GATE-DEGRADED: 复核脚本缺失"
  exit 2
fi

FAIL=0; DEGRADED=0; PASS_N=0
while IFS= read -r d; do
  [ -z "$d" ] && continue
  case "$d" in /*) full="$d" ;; *) full="$ROOT/$d" ;; esac
  out=""; rc=0
  out=$(bash "$BIN" "$full" 2>&1) || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "  ✅ $d 复核通过（机械项）"
    PASS_N=$((PASS_N + 1))
  elif [ "$rc" -eq 2 ]; then
    echo "  ❌ $d: degraded（复核自身失败 exit 2）: $(echo "$out" | grep -m1 '❌\|degraded' || echo "$out" | head -1)"
    DEGRADED=1
  else
    echo "  ❌ $d: 复核未过 (exit ${rc})——逐项点名:"
    echo "$out" | grep '⚠️\|❌' | head -6 | sed 's/^/     /'
    FAIL=1
  fi
done <<< "$DOCS"

if [ "$FAIL" -eq 1 ]; then
  echo "GATE-FAIL: 派单文档复核未过——修正派单文档（依据计划锚定/自检段/写集路径/task-state）后重试"
  exit 1
fi
if [ "$DEGRADED" -eq 1 ]; then
  echo "GATE-DEGRADED: 复核环境降级（exit 2）——显式留痕，不静默当绿（CI strict 下阻断）"
  exit 2
fi
echo "GATE-OK: ${PASS_N} 个派单文档复核通过（机械项）"
exit 0
