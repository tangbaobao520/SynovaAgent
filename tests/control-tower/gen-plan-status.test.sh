#!/bin/bash
# gen-plan-status.test.sh — 计划状态生成器的密封测试（D732）
# 覆盖: ① 正常重生成 ② 幂等 ③ 未登记任务标「未登记」 ④ 缺标记 → exit 2（三态）
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
G="$REPO/scripts/control-tower/gen-plan-status.py"
PASS=0; FAIL=0
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }; no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD=$(mktemp -d); trap 'rm -rf "$TMPD"' EXIT
mkdir -p "$TMPD/task-state"
cat > "$TMPD/task-state/D999.json" <<'J'
{"task_id":"D999","title":"fixture","status":"impl_done","audit":{"verdict":"FAIL"}}
J
cat > "$TMPD/plan.md" <<'M'
# 计划
<!-- PLAN-STATUS:BEGIN -->
| 任务 | 状态 | 审计裁决 | 标题 |
|---|---|---|---|
| D999 | 占位 |  | 待生成 |
| D998 | 占位 |  | 待生成 |
<!-- PLAN-STATUS:END -->
M
( cd "$TMPD" && python3 "$G" plan.md >/dev/null 2>&1 ) && ok "① 正常执行 exit 0" || no "① 正常执行失败"
grep -q '| D999 | impl_done | FAIL | fixture |' "$TMPD/plan.md" && ok "② 从真相源重生成（status+verdict+title）" || no "② 重生成内容不符"
grep -q '| D998 | 未登记' "$TMPD/plan.md" && ok "③ 无 task-state 标「未登记」（不静默跳过）" || no "③ 未登记路径缺失"
( cd "$TMPD" && python3 "$G" plan.md >/dev/null 2>&1 ) && ok "④ 幂等（二次执行 exit 0）" || no "④ 幂等失败"
printf '# 无标记\n' > "$TMPD/bad.md"
rc=0; ( cd "$TMPD" && python3 "$G" bad.md >/dev/null 2>&1 ) || rc=$?
[ "$rc" -eq 2 ] && ok "⑤ 缺标记 → exit 2（三态）" || no "⑤ 期望 exit 2 实得 $rc"
echo ""; echo "  结果: $PASS 通过, $FAIL 失败"; [ "$FAIL" -eq 0 ] && exit 0 || exit 1
