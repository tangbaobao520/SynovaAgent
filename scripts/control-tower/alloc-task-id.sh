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

# ═══ D456: 并发原子锁 — 撞号根治 ═══
# 背景: 同一 Mac 两个并发 DSH session 各自从陈旧 task-state 读 max，都拿到同一号
#       → D454/D455 撞车（D382 教训第二次复发）。根因 = 读 max→写 max+1 无原子性。
# 修法: mkdir 原子锁（跨平台零依赖，macOS 无 flock）包住"读占用表→分配→建壳"临界区。
#       两个进程同时 mkdir 同一锁目录，只有一个成功；另一个重试等待。
# 降级: 锁目录无法创建（权限/磁盘）→ 显式告警 + 继续（fail-open 不静默，铁律 11）。
LOCK_DIR="$ROOT/.alloc-task-id.lock"
LOCK_WAIT_SEC=30
LOCK_POLL=0.2

_lock_acquire() {
  local waited=0
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do  # swallow-ok: mkdir 失败=锁已被占用，循环重试，非错误吞掉
    if [ -d "$LOCK_DIR" ]; then
      local lock_age
      lock_age=$(python3 -c "import os,time; print(int(time.time()-os.path.getmtime('$LOCK_DIR')))" 2>/dev/null || echo 0)  # swallow-ok: 拿锁龄失败=按 0 处理，非错误
      if [ "$lock_age" -gt 60 ] 2>/dev/null; then  # swallow-ok: 数值比较失败=lock_age 非数字，按不超时处理
        echo "⚠ 检测到陈旧锁（${lock_age}s），强制清理" >&2
        rmdir "$LOCK_DIR" 2>/dev/null || true  # swallow-ok: 锁清理失败=已释放，继续
        continue
      fi
    fi
    waited=$(python3 -c "print($waited + $LOCK_POLL)" 2>/dev/null || echo 30)  # swallow-ok: 计算失败=按超时处理
    if [ "$(python3 -c "print(1 if $waited > $LOCK_WAIT_SEC else 0)" 2>/dev/null || echo 1)" = "1" ]; then  # swallow-ok: 比较失败=按超时处理
      echo "❌ 获取分配锁超时（${LOCK_WAIT_SEC}s）— 可能有并发 session 卡住" >&2
      return 1
    fi
    sleep "$LOCK_POLL"
  done
  return 0
}

_lock_release() {
  rmdir "$LOCK_DIR" 2>/dev/null || true  # swallow-ok: 释放锁失败=已释放
}

if ! _lock_acquire; then
  echo "❌ 无法获取分配锁 — 分配号中止（fail-closed，防撞号）" >&2
  exit 1
fi
trap _lock_release EXIT

# ── 读取已占用号（task-state/D*.json）──
if [ ! -d "$TASK_STATE_DIR" ]; then
  echo "❌ task-state/ 目录不存在: $TASK_STATE_DIR (fail-closed)" >&2
  exit 1
fi

# 提取已用 D 号: 唯一占用表 = task-state/D*.json（先登记后使用；brief 不参与发号）
USED=$(ls "$TASK_STATE_DIR"/D*.json 2>/dev/null | sed 's/.*\/D\([0-9]*\)\.json/\1/' | grep -E '^[0-9]+$' || true)  # swallow-ok: 空目录 ls 无匹配=正常（D# 从 1 开始）

ALL_USED=$(printf "%s\n" "$USED" | grep -E '^[0-9]+$' | sort -n | uniq || true)
MAX=$(printf "%s\n" "$ALL_USED" | tail -1 | grep -E '^[0-9]+$' || echo "0")
# D456: pipefail 下空 task-state 时 tail/grep 非零导致静默退出，显式兜底
MAX="${MAX:-0}"
[ -z "$MAX" ] && MAX="0"
NEXT=$((10#$MAX + 1))
# D500 起步（2026-08-22 创始人定）：Mac/DSH 线编号与 Win 段撞车（D471 冲突），
# 500 起避开 Win 段。Win 继续用 <500 段，两线互不干扰。
[ "$NEXT" -lt 500 ] && NEXT=500
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
# D508: 生成 brief 骨架（六字段模板接线——认领即有模板，格式错误不靠提交失败发现）
BRIEF_DIR="$ROOT/.claude/task-briefs"
BRIEF_FILE="$BRIEF_DIR/$(date +%Y-%m-%d)-${NEW_ID}-$(echo "$TITLE" | tr " " "-").md"
if [ -n "${NEW_ID:-}" ] && [ ! -f "$BRIEF_FILE" ]; then
  mkdir -p "$BRIEF_DIR"
  cat > "$BRIEF_FILE" <<SKEL
# Task Brief: ${NEW_ID} ${TITLE}

> 生成: $(date +%Y-%m-%d) | 任务: ${NEW_ID} | 认领: <agent>
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
<本任务在哪一层？该层现有模块？>
### b) 文件审计
<grep 关键文件，file:line 引用>
### c) 决策
<复用/新建/取消 及理由>

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
<引用铁律编号 + memory/ 教训；多选项必填决策参考小节>
参考：<参考系 + 结论>

## Q2: 范围 — 正确的最简方案
做什么：
- <path/to/file.ts — 改什么>
不做什么：
- 不改 scripts/audit/（K3 红线）
- 不改 <具体文件路径，排除项必须含文件名>

## Q3: 验收 — 入口 → 交互 → 结果
入口：<从哪触发>
处理：<中间步骤>
结果：<最终可验证输出>

## 架构层:
<L1-L5 或 scripts（控制塔）>

## Done 标准
- [ ] verify: <可执行命令> <预期>
SKEL
  echo "brief 骨架已生成: $BRIEF_FILE（填写后开工）"
fi
exit 0
