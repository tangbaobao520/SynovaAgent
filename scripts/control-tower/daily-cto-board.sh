#!/usr/bin/env bash
# D948 — CTO 每日自动看板（官方 schedule 触发；吸收 D796 每日体检静默失败的教训）
# 三态：0=OK 1=有红项(已告警) 2=degraded(环境不可用, fail-closed，绝不静默通过)
set -uo pipefail
REPO="${SYNO_REPO:-/Users/wane/SynovaAgent}"
OUT="$REPO/docs/synova/coordination/CTO-看板-自动.md"
LOG="$REPO/.codex/control-tower/logs/daily-board.log"
mkdir -p "$(dirname "$LOG")" "$(dirname "$OUT")"
stamp="$(date '+%Y-%m-%dT%H:%M:%S%z')"

# ── 工作区自检（D796 的失败根因就是"目标工作区已不存在"却没告警）──
if [ ! -d "$REPO/.git" ]; then
  printf '%s degraded: 目标工作区不存在 (%s)\n' "$stamp" "$REPO" | tee -a "$LOG" >&2
  echo "DAILY-BOARD: DEGRADED (工作区不存在)"; exit 2
fi
cd "$REPO" || { echo "$stamp degraded: 无法进入 $REPO" | tee -a "$LOG" >&2; echo "DAILY-BOARD: DEGRADED"; exit 2; }

red=0; body=""
sec() { body="$body
## $1
"; }
line() { body="$body- $1
"; }

# 1) DSH 断面
if a=$(python3 scripts/control-tower/check-dsh-anchor.py --repo . 2>&1); then line "✅ DSH 断面: $(echo "$a"|tail -1)"
else rc=$?; line "❌ DSH 断面: $(echo "$a"|tail -1) (rc=$rc)"; red=1; fi
# 2) 卡状态
tot=$(ls task-state/D*.json 2>/dev/null | wc -l | tr -d ' ')
line "卡总数: ${tot:-0}（在制按 task-state+worktree 判定）"
# 3) 工作树（在制槽位）
wt=$(git worktree list 2>/dev/null | wc -l | tr -d ' ')
line "工作树数: ${wt:-0}"
# 4) 门禁健康（本地软提示级）
if bash scripts/pre-commit-check.sh >/tmp/daily-pc.log 2>&1; then line "✅ 本地门禁: 全组通过"
else line "⚠️ 本地门禁: 有非通过项（详见 .codex/control-tower/logs）"; fi
# 5) 漂移/孤儿
orph=$(find . -maxdepth 1 -type d -name ".synova-wt-*" 2>/dev/null | wc -l | tr -d ' ')
line "孤儿工作树候选: ${orph:-0}"

{
  echo "# CTO 自动看板（每日）"; echo; echo "> 生成: $stamp ｜ 触发: DSH 官方 schedule ｜ 失败即告警，不静默"; echo
  echo "**结论: $([ $red = 0 ] && echo 无红项 || echo 有红项)**"; echo "$body"
} > "$OUT"

if [ $red = 0 ]; then echo "$stamp OK" >> "$LOG"; echo "DAILY-BOARD: OK → $OUT"; exit 0
else echo "$stamp RED" >> "$LOG"; echo "DAILY-BOARD: RED → ${OUT}（已告警）" >&2; exit 1; fi
