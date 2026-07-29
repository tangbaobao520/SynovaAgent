#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# V3 §3.3: 快照生命周期管理 (D261)
#
# 30 天每日保留 (每个日历日保留一个快照)
# 90 天每周保留 (每个日历周保留一个快照，跨越 30 天后)
# 90 天前 → 删除 (可配置)
#
# 用法:
#   bash scripts/cron/snapshot-cleanup.sh          # 执行清理
#   bash scripts/cron/snapshot-cleanup.sh --dry-run # 只列出要删除的
#   bash scripts/cron/snapshot-cleanup.sh --days 60 # 自定义保留天数
#
# 契约:
#   @input  — .codex/snapshots/ 目录
#   @output — 清理后的 snapshots/ 目录
#   @degraded — snapshots 目录不存在 → exit 0（非错误）
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SNAPSHOTS_DIR="$PROJECT_ROOT/.codex/snapshots"
DRY_RUN=false
RETAIN_DAYS=90

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run|--dryrun) DRY_RUN=true; shift ;;
    --days) RETAIN_DAYS="$2"; shift 2 ;;
    --help|-h) echo "Usage: snapshot-cleanup.sh [--dry-run] [--days 90]"; exit 0 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

# Snapshots dir must exist
if [ ! -d "$SNAPSHOTS_DIR" ]; then
  echo "[snapshot-cleanup] snapshots 目录不存在 — 跳过"
  exit 0
fi

echo "[snapshot-cleanup] 保留天数: $RETAIN_DAYS"
echo "[snapshot-cleanup] 扫描: $SNAPSHOTS_DIR"

# Get current timestamp
NOW_EPOCH=$(date +%s)
CUTOFF_EPOCH=$((NOW_EPOCH - RETAIN_DAYS * 86400))

DELETED=0
KEPT_DAILY=()
KEPT_WEEKLY=()
SEEN_DAYS=()
SEEN_WEEKS=()

# Sort snapshots by name (which is timestamp-based)
for SNAP in "$SNAPSHOTS_DIR"/[0-9]*/; do
  [ -d "$SNAP" ] || continue
  SNAP_NAME=$(basename "$SNAP")

  # Try to parse timestamp from directory name
  # Formats: 20260729T143022 or 2026-07-29T14:30:22 or 20260729
  SNAP_EPOCH=0
  if echo "$SNAP_NAME" | grep -qE '^[0-9]{8}T[0-9]{6}$'; then
    SNAP_EPOCH=$(date -d "${SNAP_NAME:0:8} ${SNAP_NAME:9:2}:${SNAP_NAME:11:2}:${SNAP_NAME:13:2}" +%s 2>/dev/null || echo 0)
  elif echo "$SNAP_NAME" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'; then
    SNAP_EPOCH=$(date -d "${SNAP_NAME:0:19}" +%s 2>/dev/null || echo 0)
  elif echo "$SNAP_NAME" | grep -qE '^[0-9]{8}$'; then
    SNAP_EPOCH=$(date -d "${SNAP_NAME:0:8}" +%s 2>/dev/null || echo 0)
  fi

  if [ "$SNAP_EPOCH" -eq 0 ]; then
    echo "[snapshot-cleanup]  ⚠ 无法解析时间戳: $SNAP_NAME — 跳过"
    continue
  fi

  # Check if snapshot is older than cutoff
  if [ "$SNAP_EPOCH" -lt "$CUTOFF_EPOCH" ]; then
    # Old snapshot — delete
    if [ "$DRY_RUN" = true ]; then
      echo "[snapshot-cleanup]  [删除] $SNAP_NAME (超过 ${RETAIN_DAYS} 天)"
    else
      rm -rf "$SNAP"
      echo "[snapshot-cleanup]  [已删除] $SNAP_NAME"
    fi
    DELETED=$((DELETED + 1))
    continue
  fi

  # Within retention — deduplicate daily
  SNAP_DAY="${SNAP_NAME:0:10}"  # YYYY-MM-DD or YYYYMMDD
  SNAP_WEEK="${SNAP_NAME:0:7}"  # YYYY-MM or YYYYMM

  # For <30 days: keep one per day (latest)
  if [ $((NOW_EPOCH - SNAP_EPOCH)) -lt $((30 * 86400)) ]; then
    if [[ " ${SEEN_DAYS[*]} " =~ " ${SNAP_DAY} " ]]; then
      # Duplicate day — remove older
      if [ "$DRY_RUN" = true ]; then
        echo "[snapshot-cleanup]  [去重] $SNAP_NAME (当天已有快照)"
      else
        rm -rf "$SNAP"
        echo "[snapshot-cleanup]  [已去重] $SNAP_NAME"
      fi
      DELETED=$((DELETED + 1))
    else
      SEEN_DAYS+=("$SNAP_DAY")
      KEPT_DAILY+=("$SNAP_NAME")
    fi
  else
    # 30-90 days: keep one per week
    if [[ " ${SEEN_WEEKS[*]} " =~ " ${SNAP_WEEK} " ]]; then
      if [ "$DRY_RUN" = true ]; then
        echo "[snapshot-cleanup]  [周去重] $SNAP_NAME (当周已有快照)"
      else
        rm -rf "$SNAP"
        echo "[snapshot-cleanup]  [已周去重] $SNAP_NAME"
      fi
      DELETED=$((DELETED + 1))
    else
      SEEN_WEEKS+=("$SNAP_WEEK")
      KEPT_WEEKLY+=("$SNAP_NAME")
    fi
  fi
done

echo "[snapshot-cleanup] 完成: 删除 ${DELETED} 个, 保留 ${#KEPT_DAILY[@]} 个每日 + ${#KEPT_WEEKLY[@]} 个每周"
