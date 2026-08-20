#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# generate-chronicle-monthly.test.sh — 月报生成脚本测试（铁律 48：正常/边界/降级三路径）
# 用例: A 有文件+git降级→0 | A1-A3 输出含文件名 | B 空月→0+提示 | C/C2 非法月份→1
# 运行: bash tests/doc-system/generate-chronicle-monthly.test.sh
# ═══════════════════════════════════════════════════════════════════════════════
set +e
SCRIPT="$(cd "$(dirname "$0")/../.." && pwd)/scripts/doc-system/generate-chronicle-monthly.sh"
PASS=0; FAIL=0

t() { # $1=用例名 $2=期望 $3=实际
  if [ "$2" = "$3" ]; then echo "  ✅ $1 (exit $3)"; PASS=$((PASS+1)); else echo "  ❌ $1 (期望 $2 实际 $3)"; FAIL=$((FAIL+1)); fi
}

FIX=$(mktemp -d)
trap 'rm -rf "$FIX"' EXIT
mkdir -p "$FIX/docs/synova/audit-reports" "$FIX/memory"
: > "$FIX/WORKLOG-20260818.md"
: > "$FIX/docs/synova/audit-reports/2026-08-15-D366.md"
: > "$FIX/memory/session-2026-08-10.md"

# A: 有文件 + 无 git（降级路径）→ exit 0
OUT=$(DOC_TRUTH_ROOT="$FIX" bash "$SCRIPT" 2026-08 2>&1); RC=$?
t "A 有文件+git降级" 0 $RC
echo "$OUT" | grep -q 'WORKLOG-20260818.md'; t "A1 含WORKLOG" 0 $?
echo "$OUT" | grep -q 'D366'; t "A2 含审计报告" 0 $?
echo "$OUT" | grep -q 'session-2026-08-10'; t "A3 含会话记忆" 0 $?
echo "$OUT" | grep -q '降级'; t "A4 降级有提示" 0 $?

# B: 空月份（无文件）→ exit 0 且提示"无 WORKLOG"
OUT2=$(DOC_TRUTH_ROOT="$FIX" bash "$SCRIPT" 2026-07 2>&1); RC=$?
t "B 空月" 0 $RC
echo "$OUT2" | grep -q '无 WORKLOG'; t "B1 提示日记为空" 0 $?

# C: 非法月份 → exit 1（边界）
DOC_TRUTH_ROOT="$FIX" bash "$SCRIPT" '2026-13' >/dev/null 2>&1; t "C 非法月份" 1 $?
DOC_TRUTH_ROOT="$FIX" bash "$SCRIPT" 'abc' >/dev/null 2>&1; t "C2 非数字" 1 $?

echo "── 汇总: $PASS 通过 / $FAIL 失败 ──"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
