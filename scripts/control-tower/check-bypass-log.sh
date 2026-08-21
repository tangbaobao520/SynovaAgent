#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# check-bypass-log.sh — D331 (L4-2 / P1-2): bypass.log 执行证据链对账
#
# 背景: D329 的 dc369fd 经 git commit --amend 重提交 — synova-commit 的 pathspec
# 提交（-- "${FILES[@]}"）不含删除/改回，配套变更须 amend 并入；amend 绕过了
# synova-commit 的 COMMITTED 记录写入，导致版本锚点 tag 与执行证据链同时断裂
# （tag V4.7.1 孤儿 f685fa0 + dc369fd 无 bypass.log 记录），无人发现（无对账方）。
#
# 对账: 对比 <base>..HEAD 全部提交与 .claude/bypass.log 的 HASH 条目；
#       缺失 → 列出 + exit 1（新提交硬要求）；全部有记录 → exit 0。
#
# 用法: bash check-bypass-log.sh [base-ref]
#       默认 base: origin/feat/prompt-architecture（D311 改基约定）
# 注入: SYNO_BASE_REF 环境变量覆盖（测试隔离；显式给出则必须可解析）
# 豁免: 历史提交一次性补记（D331 已对 ea1cb71/dc369fd 回填）；对账从 D331 起强制
# 降级: 日志缺失 → exit 1（执行证据链缺失显式列出）；base 不可解析且非显式
#       → fetch 一次后仍不可用 → 显式跳过 exit 2（fail-closed，不当作通过 — D414/U1c 修复 M1 假 PASS）
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
LOG="$ROOT/.claude/bypass.log"
BASE="${SYNO_BASE_REF:-${1:-origin/feat/prompt-architecture}}"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'

if [[ ! -f "$LOG" ]]; then
  echo -e "${RED}❌ bypass.log 不存在: $LOG${RESET}"
  echo "  执行证据链缺失 — 请确认提交均经 synova-commit（含 COMMITTED 记录）或一次性补记"
  exit 1
fi

# base 可解析性: 显式 SYNO_BASE_REF 不可解析 → 硬错误（测试/调用方给错引用须显式暴露）
if ! git rev-parse --verify "$BASE" >/dev/null 2>&1; then
  if [[ -n "${SYNO_BASE_REF:-}" ]]; then
    echo -e "${RED}❌ base 不可解析: $BASE${RESET}"
    exit 1
  fi
  git fetch origin >/dev/null 2>&1 || true
  if ! git rev-parse --verify "$BASE" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  base 引用缺失 ($BASE) — 对账无法执行（fail-closed，exit 2 不当作通过）${RESET}"
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) check-bypass-log degraded: base $BASE 不可解析, 对账跳过" >> "$ROOT/.claude/degraded-events.log" 2>/dev/null || true
    exit 2
  fi
fi

MISSING=""
# D334: --no-merges — PR 工作流下 GitHub 网页合并产生的 merge commit 不经过
# synova-commit（无 COMMITTED 记录），对账只覆盖本地产生的实体提交。
# D414/U1c: git log 失败检测 — 原 `|| true` 会把"git 失败空循环"当成"对账通过"（M1 假 PASS）。
# D451: 豁免"纯补记提交"——只改 .claude/bypass.log 的提交本身就是补记动作，
#   它改的就是证据文件，不能被要求"自己被自己记录"（否则补记→新提交→再缺→死循环）。
GIT_LOG_OUT=$(git log "$BASE..HEAD" --format=%H --no-merges 2>&1)
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ git log 执行失败 ($BASE..HEAD) — 对账无法执行（fail-closed, 不当作通过）${RESET}" >&2
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) check-bypass-log degraded: git log $BASE..HEAD 失败" >> "$ROOT/.claude/degraded-events.log" 2>/dev/null || true
  exit 2
fi
for h in $GIT_LOG_OUT; do
  # D451: 纯补记提交（只改 bypass.log）豁免——它是补记动作本身
  _FILES=$(git show --name-only --format="" "$h" 2>/dev/null | grep -v '^$' || true)
  _OTHER=$(echo "$_FILES" | grep -v '^\.claude/bypass\.log$' || true)
  if [ -z "$_OTHER" ]; then
    continue
  fi
  if ! grep -q "$h" "$LOG" 2>/dev/null; then
    SUBJ=$(git log -1 --format=%s "$h" 2>/dev/null || echo "$h")
    MISSING="${MISSING}  $SUBJ [${h:0:8}]\n"
  fi
done

if [[ -n "$MISSING" ]]; then
  echo -e "${RED}❌ bypass.log 缺以下提交记录（执行证据链断裂）:${RESET}"
  printf '%b' "$MISSING"
  echo "  请确认提交经 synova-commit（含 COMMITTED 记录）或一次性补记后再推送"
  exit 1
fi

echo -e "${GREEN}✅ bypass.log 对账通过: $BASE..HEAD 全部提交有记录${RESET}"
exit 0
