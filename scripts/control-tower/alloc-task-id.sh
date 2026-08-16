#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# alloc-task-id.sh — D# 统一分配器（CT-36, 2026-08-16, D384 折入）
#
# 背景: D382 编号撞车 + D339 教训 — 分散取号 + 零检查 = 必然撞车。
#       本脚本是 D# 分配的唯一入口：查 task-state/ 占用表 → 分配下一个号 →
#       自动建空壳登记（先登记后使用）。任何角色（CTO 派活 / dev-doc / 编码）
#       取号必须调它，物理上防撞车。
#
# 契约:
#   @input  — 任务名（必填）; --dry-run 只打印不写
#   @output — stdout: 分配到的 D#（如 D384）; 空壳 task-state/D384.json 已建
#   @degraded — task-state/ 不可读 → exit 1 + 提示（fail-closed，不盲发号）
#
# 用法:
#   bash alloc-task-id.sh "path-dependency 空壳补实现"      # 分配 + 建壳
#   bash alloc-task-id.sh "task-name" --dry-run             # 只预览下一个号
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# 项目标准定位: 脚本自身路径 → 仓库根（不依赖 git rev-parse, 兼容 worktree/沙箱）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# 注入缝 (测试隔离): SYNO_TASK_STATE_DIR 覆盖真实 task-state/
TASK_STATE_DIR="${SYNO_TASK_STATE_DIR:-$ROOT/task-state}"
TEMPLATE="$TASK_STATE_DIR/TEMPLATE.json"

DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && { DRY_RUN=true; shift; }
[ "${2:-}" = "--dry-run" ] && { DRY_RUN=true; }
TITLE="${1:-}"
[ -z "$TITLE" ] && { echo "用法: alloc-task-id.sh <任务名> [--dry-run]" >&2; exit 1; }

# ── 读取已占用号（task-state/D*.json）──
if [ ! -d "$TASK_STATE_DIR" ]; then
  echo "❌ task-state/ 目录不存在: $TASK_STATE_DIR (fail-closed)" >&2
  exit 1
fi

# 提取已用 D 号: 唯一占用表 = task-state/D*.json（先登记后使用；brief 不参与发号）
USED=$(ls "$TASK_STATE_DIR"/D*.json 2>/dev/null | sed 's/.*\/D\([0-9]*\)\.json/\1/' | grep -E '^[0-9]+$' || true)

ALL_USED=$(printf "%s\n" "$USED" | grep -E '^[0-9]+$' | sort -n | uniq)
MAX=$(printf "%s\n" "$ALL_USED" | tail -1 | grep -E '^[0-9]+$' || echo "0")
NEXT=$((10#$MAX + 1))
NEW_ID="D${NEXT}"

if [ "$DRY_RUN" = true ]; then
  echo "$NEW_ID (dry-run, 未建壳)"
  exit 0
fi

# ── 建空壳登记（先登记后使用）──
STATE_FILE="$TASK_STATE_DIR/$NEW_ID.json"
if [ -f "$STATE_FILE" ]; then
  echo "❌ 撞车: $NEW_ID 已存在 ($STATE_FILE) — 手工清理后重试" >&2
  exit 1
fi

cat > "$STATE_FILE" <<EOF
{
  "task_id": "$NEW_ID",
  "title": "$TITLE",
  "status": "claimed",
  "spec": null,
  "impl": null,
  "audit": null,
  "fix_task_id": null,
  "updated_at": "$(date +%Y-%m-%d)",
  "updated_by": "alloc-task-id"
}
EOF

echo "$NEW_ID"
echo "已登记: $STATE_FILE (status=claimed)"
exit 0
