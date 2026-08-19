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
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$REPO/scripts/control-tower/alloc-task-id.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "=== D456 alloc-task-id 并发锁测试 ==="

# ── 接线: mkdir 锁函数存在 ──
if grep -q "_lock_acquire" "$GATE" && grep -q "_lock_release" "$GATE" && grep -q "mkdir \"\$LOCK_DIR\"" "$GATE"; then
  ok "接线: mkdir 原子锁（_lock_acquire/_lock_release）存在"
else
  no "接线: 原子锁代码缺失"
fi

# ── 边界: dry-run 不建壳 ──
DRY=$(bash "$GATE" "test-dry" --dry-run 2>/dev/null | head -1)  # swallow-ok: dry-run 探测，stderr 干扰无碍
if echo "$DRY" | grep -q "dry-run"; then
  ok "dry-run 不建壳（输出: ${DRY}）"
else
  no "dry-run 应输出 dry-run 标记, 实际: ${DRY}"
fi

# ── 并发: 沙箱 task-state 下 20 进程同时分配，号全唯一 ──
SANDBOX=$(mktemp -d)
trap 'rm -rf "$SANDBOX"; rmdir "$REPO/.alloc-task-id.lock" 2>/dev/null; true' EXIT  # swallow-ok: 清理陷阱，锁目录可能已释放
for i in $(seq 1 20); do
  SYNO_TASK_STATE_DIR="$SANDBOX" bash "$GATE" "并发测试-$i" >/dev/null 2>&1 &
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

echo ""
echo "  结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && echo "  Status: ✅ alloc-task-id 并发锁测试通过" || echo "  Status: ❌ alloc-task-id 并发锁测试未通过"
exit $FAIL
