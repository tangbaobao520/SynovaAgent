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
#   @exit   — 0 = 分配成功（空壳已登记）; 非 0 = 失败。D938 成功哨兵：任何没走到
#             「显式成功退出点」的终止一律非 0（EXIT trap 不再把失败洗成 rc=0）；
#             骨架生成失败 → 回滚登记（不烧号）后非 0。
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
# D938 成功哨兵: 只有走过「合法成功退出点」才置 DONE=1（见 _lock_release）。
#   动机: EXIT trap 退出码 = trap 内最后一条命令的退出码（实测 _lock_release 末句
#   `rmdir … || true` → 恒 0），且 set -e/set -u 中止时 trap 内 $? 读到 0、ERR trap
#   不触发 → 脚本报错却 rc=0（fail-open）。哨兵把「没成功」一律判成非 0。
DONE=0

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
  local rc=$?  # 必须首句捕获：任何命令都会覆盖 $?
  # D938 fail-closed: 未走到显式成功退出点（DONE≠1）而 rc=0 → 判定失败。
  #   覆盖两种实测场景: (a) 末条命令决定 trap 退出码; (b) set -e/set -u 中止时 $? 读到 0。
  if [ "$rc" -eq 0 ] && [ "${DONE:-0}" != "1" ]; then
    rc=1
  fi
  rmdir "$LOCK_DIR" 2>/dev/null || true  # swallow-ok: 释放锁失败=已释放
  exit "$rc"  # 显式导出退出码（EXIT trap 内 exit 不回递归触发 trap）
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
# D550: 合并 origin/main 的 task-state 占用（防落后主工作区漏号——D547/D548 撞号实证：
#   本地 task-state 无 D547.json 而 main 已有 → alloc 重发 D547）。降级：无 origin 时仅本地 + 显式提示。
REMOTE_USED=""
if [ "${SYNO_ALLOC_NO_REMOTE:-0}" = "1" ]; then
  :  # 测试注入缝: 禁用 remote 合并（隔离 origin/main 依赖，测本地发号语义）
elif git ls-tree --name-only origin/main task-state/ >/dev/null 2>&1; then
  REMOTE_USED=$(git ls-tree --name-only origin/main task-state/ 2>/dev/null | sed 's/.*\/D\([0-9]*\)\.json/\1/' | grep -E '^[0-9]+$' || true)
else
  echo "⚠ alloc-task-id: origin/main 不可读——仅按本地 task-state 发号（可能漏号，建议先 git fetch）" >&2
fi
USED="$(printf '%s\n%s\n' "$USED" "$REMOTE_USED" | grep -E '^[0-9]+$' || true)"

# D576（CT-54）: 在途分支/worktree 盲区修复——alloc 只看 origin/main + 本地主 task-state，
# 看不到其他 worktree / 本地分支 task-state 里「先登记后使用」的壳（D575 撞 D573 在途分支实证：
# alloc 发了 D573 而 chore/d573-* 分支已占用）。扫 git worktree list 的每个 worktree 的
# task-state/D*.json 合入占用表。语义：扫描跟随 TASK_STATE_DIR 所属仓库（测试注入临时目录
# = 非 git → 自动跳过）；SYNO_ALLOC_NO_WORKTREE=1 测试注入缝；降级显式提示（不静默）。
WORKTREE_USED=""
if [ "${SYNO_ALLOC_NO_WORKTREE:-0}" = "1" ]; then
  :  # 测试注入缝: 禁用 worktree 扫描
else
  TS_TOP="$(git -C "$TASK_STATE_DIR" rev-parse --show-toplevel 2>/dev/null || echo "")"
  if [ -z "$TS_TOP" ]; then
    :  # task-state 目录不在 git 仓库内（测试沙箱/非常规布局）→ 无 worktree 语义，跳过
  elif WORKTREE_LIST=$(git -C "$TS_TOP" worktree list --porcelain 2>/dev/null); then
    WT_DIRS=$(printf '%s\n' "$WORKTREE_LIST" | awk '/^worktree /{print $2}')
    for wt in $WT_DIRS; do
      [ "$wt" = "$TS_TOP" ] && continue  # 主工作区已读（TASK_STATE_DIR）
      for f in "$wt"/task-state/D*.json; do
        [ -e "$f" ] || continue
        bn=$(basename "$f")
        case "$bn" in
          D[0-9]*.json)
            n=${bn#D}; n=${n%.json}
            case "$n" in ''|*[!0-9]*) continue ;; esac
            WORKTREE_USED="${WORKTREE_USED}${n}
"
            ;;
        esac
      done
    done
  else
    echo "⚠ alloc-task-id: git worktree list 失败——在途 worktree 占用检查跳过（可能漏号）" >&2
  fi
fi
USED="$(printf '%s\n%s\n' "$USED" "$WORKTREE_USED" | grep -E '^[0-9]+$' || true)"

# CT-63: 远端分支名 D# 扫描——Win/Claude 线自编号不走 alloc，分支名是唯一在途信号
#   （D593/D594 撞号实证：Win 用 D593 做 B-02/B-06，Mac 同时用 D593 做报告落盘）
#   扫描: git branch -r 全远端分支名中的 D[0-9]+（大小写不敏感）→ 合入占用表
#   注入缝: SYNO_ALLOC_NO_BRANCH=1（测试隔离）
BRANCH_USED=""
if [ "${SYNO_ALLOC_NO_BRANCH:-0}" = "1" ]; then
  :  # 测试注入缝
else
  TS_TOP="$(git -C "$TASK_STATE_DIR" rev-parse --show-toplevel 2>/dev/null || echo "")"
  if [ -n "$TS_TOP" ]; then
    BRANCH_IDS=$(git -C "$TS_TOP" branch -r --format='%(refname:short)' 2>/dev/null | grep -ioE 'D[0-9]+' | tr '[:lower:]' '[:upper:]' | sed 's/D//' | grep -E '^[0-9]+$' || true)
    [ -n "$BRANCH_IDS" ] && BRANCH_USED="$BRANCH_IDS"
  fi
fi
USED="$(printf '%s\n%s\n' "$USED" "$BRANCH_USED" | grep -E '^[0-9]+$' || true)"

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
  DONE=1  # D938: 合法成功退出点
  exit 0
fi

# ── D938: 骨架路径先算好（纯计算，零副作用）——必须在登记 task-state **之前** ──
# D521: SYNO_BRIEF_DIR 注入缝（测试隔离，同 SYNO_TASK_STATE_DIR 模式）——
#   修测试污染: alloc-task-id.test.sh 曾在真实 brief 目录生成占位 brief（含模板排除项
#   占位文本，CI strict 下 plan-integrity 硬炸）
BRIEF_DIR="${SYNO_BRIEF_DIR:-$ROOT/.claude/task-briefs}"
# D938 缺陷③: title 含路径分隔符（如 "M1/ownership 域修正"）→ 骨架路径裂成子目录
#   → 生成失败，但 D# 已登记 = **孤儿号**（号烧掉、无人认领；实测 D500 已登记 + 骨架 0 个）。
#   修法: 路径分隔符（`/`、Windows `\`）与空格统一转 `-`，保持可读。
SAFE_TITLE="$(printf '%s' "$TITLE" | tr ' /' '--' | tr '\\' '-')"
BRIEF_FILE="$BRIEF_DIR/$(date +%Y-%m-%d)-${NEW_ID}-${SAFE_TITLE}.md"

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
# D718 机制级防线（同类第二次复发）: D521 已给 alloc-task-id.test.sh 补 SYNO_BRIEF_DIR 注入缝，
#   但 alloc-task-id-lock.test.sh 漏设 → 每次运行把 20 份骨架 brief 写进**真实仓库**
#   （实测泄漏 56 份）。逐测试打补丁无效（同类第 2 次）→ 在源头 fail-closed：
#   task-state 被注入（= 测试沙箱）而 brief 目录未注入时，拒绝生成骨架，显式告警不静默。
#   生产路径不受影响（不设 SYNO_TASK_STATE_DIR 时该分支不触发）。
if [ -n "${SYNO_TASK_STATE_DIR:-}" ] && [ -z "${SYNO_BRIEF_DIR:-}" ]; then
  echo "⚠ alloc-task-id: task-state 已注入（${TASK_STATE_DIR}）但未注入 SYNO_BRIEF_DIR" >&2
  echo "  → 跳过 brief 骨架生成，防污染真实仓库（测试请同时设 SYNO_BRIEF_DIR）" >&2
  DONE=1  # D938: 合法提前退出（D718 守卫），非失败 —— 不得被成功哨兵误判
  exit 0
fi

# D938 同成同败: 骨架是「认领即完成」的一半，生成失败必须回滚刚登记的空壳 ——
#   否则留下孤儿号（号已烧、骨架 0 个，实测 D500）。回滚点安全：登记前已确认该文件不存在。
_brief_generation_failed() {
  rm -f "$STATE_FILE" 2>/dev/null || true  # swallow-ok: 回滚失败不掩盖主错误（下一句即非零退出）
  echo "❌ brief 骨架生成失败（$1）→ 已回滚 $NEW_ID 登记（防空烧号，fail-closed）" >&2
  exit 1
}
if [ -n "${NEW_ID:-}" ] && [ ! -f "$BRIEF_FILE" ]; then
  mkdir -p "$BRIEF_DIR" || _brief_generation_failed "目录创建失败: $BRIEF_DIR"
  cat > "$BRIEF_FILE" <<SKEL || _brief_generation_failed "写入失败: $BRIEF_FILE"
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
  echo "brief 骨架已生成: ${BRIEF_FILE}（填写后开工）"
fi
DONE=1  # D938: 合法成功退出点（空壳 + 骨架均已落盘）
exit 0
