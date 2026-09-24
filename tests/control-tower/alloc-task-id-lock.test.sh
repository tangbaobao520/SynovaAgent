#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# alloc-task-id-lock.test.sh — D456 并发原子锁测试
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常 — 单进程分配 → 拿到号 + 建壳
#   并发 — 20 进程同时分配 → 无撞号（号全唯一）
#   边界 — dry-run 不建壳；锁释放后目录清理
#   接线 — alloc-task-id.sh 含 mkdir 锁（_lock_acquire/_lock_release）
#   D718 — 真仓零污染：task-state + brief 双注入（旧版只注入前者 → 每次跑泄漏 20 份骨架）
#          反假绿断言：沙箱必须真收到 20 份（防「注入被静默跳过」让零污染断言假绿）
#   D938-a — **消费 SYNO_LOCK_DIR 注入缝**：本测试自带唯一锁目录，不再与
#          alloc-task-id.test.sh 争仓库级 `$ROOT/.alloc-task-id.lock`
#          （改前实测：两测试并发 → alloc-task-id.test.sh A 组 FAIL=4）。
#          说明: 本文件在 D938-T2 时判定「不动」（A′ 只改退出码语义，而本测试不读退出码 ——
#          证据 B/C 见 docs/synova/product-lines/evidence/D938-夹具原始输出.md §5）；
#          现按 CTO 裁定 a 改为「动」，**动的是并发隔离（消费新缝），不是退出码语义**，
#          §5 的三条「不动」证据仍成立且保留（它们证明的是 A′ 对本测试断言无影响）。
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$REPO/scripts/control-tower/alloc-task-id.sh"
LOCK_ROOT="$(mktemp -d)"                     # D938-a: 每进程唯一锁父目录
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
trap 'rm -rf "$LOCK_ROOT"; rm -rf "${SANDBOX:-/nonexistent-d938a}"; rmdir "$REPO/.alloc-task-id.lock" 2>/dev/null; true' EXIT  # swallow-ok: 清理陷阱，锁目录/沙箱可能已释放

echo "=== D456 alloc-task-id 并发锁测试 ==="

# ── 接线: mkdir 锁函数存在 + D938-a 注入缝被消费（行为判别，非纯 grep）──
if grep -q "_lock_acquire" "$GATE" && grep -q "_lock_release" "$GATE" && grep -q "mkdir \"\$LOCK_DIR\"" "$GATE"; then
  ok "接线: mkdir 原子锁（_lock_acquire/_lock_release）存在"
else
  no "接线: 原子锁代码缺失"
fi
# D938-a: 缝消费判别（路径特异，主判据 = 注入目录被清理；告警文字仅作次级证据 ——
#   只看告警会假阳: 仓库锁恰好陈旧时告警也会出现）
STALE_DIR="$LOCK_ROOT/stale"
mkdir -p "$STALE_DIR/lock"; : > "$STALE_DIR/ref"
touch -t 200001010000 "$STALE_DIR/ref"; touch -r "$STALE_DIR/ref" "$STALE_DIR/lock"
STALE_OUT=$(SYNO_LOCK_DIR="$STALE_DIR/lock" bash "$GATE" "缝探针" --dry-run 2>&1 || true)
if [ ! -d "$STALE_DIR/lock" ]; then
  ok "接线: 消费 SYNO_LOCK_DIR 注入缝（注入锁目录运行后被清理 = 路径特异行为判别）"
else
  no "接线: 未消费 SYNO_LOCK_DIR —— 注入的锁目录仍在（并发仍会与 alloc-task-id.test.sh 撞仓库锁）"
fi
echo "$STALE_OUT" | grep -q "陈旧锁" && ok "接线: 陈旧清理分支可达（次级证据）" || no "接线: 陈旧清理分支未触发（次级证据缺失）"

# ── 边界: dry-run 不建壳 ──
DRY=$(SYNO_LOCK_DIR="$LOCK_ROOT/dry" bash "$GATE" "test-dry" --dry-run 2>/dev/null | head -1)  # swallow-ok: dry-run 探测，stderr 干扰无碍
if echo "$DRY" | grep -q "dry-run"; then
  ok "dry-run 不建壳（输出: ${DRY}）"
else
  no "dry-run 应输出 dry-run 标记, 实际: ${DRY}"
fi

# ── 并发: 沙箱 task-state 下 20 进程同时分配，号全唯一 ──
SANDBOX=$(mktemp -d)
# D718: 真仓零污染基线——brief 目录必须同时注入（只注入 task-state 会让骨架 brief 落进
#   真实仓库；D521 修过 alloc-task-id.test.sh，本测试漏设 = 同类第二次复发）
# D938-a: 20 进程**共用本测试自己的**锁目录（$SANDBOX/lock）——原子锁语义照测（仍互斥），
#   但整段不再占用仓库级锁 → 可与 alloc-task-id.test.sh 并发（每进程一沙箱一锁目录）。
BRIEFS_BEFORE=$(ls "$REPO/.claude/task-briefs/" 2>/dev/null | wc -l | tr -d ' ')  # swallow-ok: 目录缺失=0 份，非错误
for i in $(seq 1 20); do
  SYNO_TASK_STATE_DIR="$SANDBOX" SYNO_BRIEF_DIR="$SANDBOX/briefs" SYNO_LOCK_DIR="$SANDBOX/lock" \
    bash "$GATE" "并发测试-$i" >/dev/null 2>&1 &
done
wait
# 统计沙箱里生成的号
IDS=$(ls "$SANDBOX"/D*.json 2>/dev/null | sed 's/.*\/D\([0-9]*\)\.json/\1/' | sort -n)  # swallow-ok: 空目录 ls 无匹配=正常
CNT=$(echo "$IDS" | grep -E '^[0-9]+$' | wc -l | tr -d ' ')
UNIQ=$(echo "$IDS" | sort -u | wc -l | tr -d ' ')
if [ "$CNT" = "20" ] && [ "$UNIQ" = "20" ]; then
  ok "并发 20 进程 → 20 个唯一号（无撞号）"
else
  no "并发分配应 20 唯一号, 实际 $CNT 个/唯一 $UNIQ"
fi

# ── D718: 真仓零污染（防同类复发——旧版每次跑泄漏 20 份骨架进真仓）──
BRIEFS_AFTER=$(ls "$REPO/.claude/task-briefs/" 2>/dev/null | wc -l | tr -d ' ')  # swallow-ok: 目录缺失=0 份，非错误
if [ "$BRIEFS_AFTER" = "$BRIEFS_BEFORE" ]; then
  ok "真实 .claude/task-briefs/ 零污染（$BRIEFS_BEFORE → $BRIEFS_AFTER 份）"
else
  no "骨架 brief 泄漏进真仓: +$((BRIEFS_AFTER - BRIEFS_BEFORE)) 份（应注入 SYNO_BRIEF_DIR）"
fi
# 反假绿：断言 brief 真进了沙箱。否则「注入被静默跳过」会让上一条断言假绿（0→0 = 通过）
SB_CNT=$(ls "$SANDBOX/briefs/" 2>/dev/null | wc -l | tr -d ' ')  # swallow-ok: 空目录=0，非错误
if [ "$SB_CNT" = "20" ]; then
  ok "沙箱 brief 目录收到 20 份骨架（注入缝真实生效，非静默跳过）"
else
  no "沙箱 brief 应 20 份，实际 ${SB_CNT}（注入未生效 → 上一条断言无意义）"
fi

echo ""
echo "  结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && echo "  Status: ✅ alloc-task-id 并发锁测试通过" || echo "  Status: ❌ alloc-task-id 并发锁测试未通过"
exit $FAIL
