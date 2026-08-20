#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# chronicle-monthly-wrapper.sh — 月报定时包装（供定时器调用，治理机制 #4 的半自动闭环）
#
# 契约（铁律 47 契约优先）:
#   输入:  无（自动取当前月份）；环境 DOC_TRUTH_ROOT 可覆盖仓库根
#   输出:  docs/authority/chronicle-drafts/YYYY-MM.md（月度史记草稿）
#          追加一条运行日志到 chronicle-drafts/monthly-run.log；exit 0
#   降级:  git 不可用 → 月报内 ⚠️ 提示（generator 已处理，不静默）
# 用途:   cron / schtasks / launchd 每月 1 号调用，实现"史记自动生长、无人记得也断不了"
# ═══════════════════════════════════════════════════════════════════════════════
set +e
ROOT="${DOC_TRUTH_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
MONTH=$(date +%Y-%m)
OUT="$ROOT/docs/authority/chronicle-drafts/$MONTH.md"
mkdir -p "$ROOT/docs/authority/chronicle-drafts"
DOC_TRUTH_ROOT="$ROOT" bash "$ROOT/scripts/doc-system/generate-chronicle-monthly.sh" "$MONTH" > "$OUT" 2>&1
RC=$?
echo "[$(date '+%Y-%m-%d %H:%M')] 月度史记草稿已生成: $OUT (exit $RC)" >> "$ROOT/docs/authority/chronicle-drafts/monthly-run.log"
echo "生成完成: $OUT"
exit "$RC"
