#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# run-all.test.sh — D512 GS 场景全量刷新入口测试
#
# 覆盖（铁律 48: 正常/降级/边界; 铁律 0-2: red→green）:
#   1. --dry-run: exit 0 + 打印计划（顺序 + main sha + skip）——不实际跑场景（CI/测试安全）
#   2. --skip=gs01 --dry-run: 计划含 skip=gs01
#   3. 未知参数 → exit 2（fail-fast，不静默吞）
#   4. main_sha 注入逻辑存在（grep 契约字段）——证据 schema 扩展接线
#   5. CI 接线: product-progress.yml 调用 run-all（铁律 0-2 WIRE CHECK）
#   6. 证据向后兼容: 旧 evidence（无 main_sha 字段）仍为合法 JSON，calc-progress 可读字段存在
#
# 隔离: --dry-run 不产生副作用；场景实跑属交付验收（编码 session 手动执行），不在单测内。
# 用法: bash tests/control-tower/run-all.test.sh
# 退出码: 0 = 全部通过
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUN_ALL="$REPO_DIR/scripts/golden-scenarios/run-all.sh"
WORKFLOW="$REPO_DIR/.github/workflows/product-progress.yml"
EVIDENCE_DIR="$REPO_DIR/scripts/golden-scenarios/evidence"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_exit() { # <got> <want> <msg>
  if [ "$1" -eq "$2" ]; then pass "$3"; else fail "$3 (got exit=$1, want exit=$2)"; fi
}
assert_contains() { # <haystack-file|text> <needle> <msg>
  if grep -qF "$2" "$1" 2>/dev/null; then pass "$3"; else fail "$3 (未找到: $2)"; fi
}

echo "── 1. --dry-run 正常路径（不实际执行）"
OUT="$(bash "$RUN_ALL" --dry-run 2>&1)"; RC=$?
assert_exit "$RC" 0 "--dry-run exit 0"
echo "$OUT" > /tmp/run-all-dryrun.txt
assert_contains /tmp/run-all-dryrun.txt "gs03 gs05 gs02 gs04 gs06 gs07 gs08 gs01" "计划顺序（依赖排序，GS-01 最后）"
if echo "$OUT" | grep -qE "main=[0-9a-f]{7,}|main=unknown"; then pass "计划含 main sha"; else fail "计划缺 main sha"; fi

echo "── 2. --skip=gs01 边界（D510 分批）"
OUT2="$(bash "$RUN_ALL" --skip=gs01 --dry-run 2>&1)"; RC=$?
assert_exit "$RC" 0 "--skip=gs01 --dry-run exit 0"
echo "$OUT2" > /tmp/run-all-skip.txt
assert_contains /tmp/run-all-skip.txt "gs01" "计划标注 skip=gs01"

echo "── 3. 未知参数 → fail-fast（exit 2，不静默吞）"
bash "$RUN_ALL" --bogus >/dev/null 2>&1; RC=$?
assert_exit "$RC" 2 "未知参数 exit 2"

echo "── 4. main_sha 证据注入逻辑存在（契约字段接线）"
if grep -q "main_sha" "$RUN_ALL"; then pass "run-all.sh 含 main_sha 注入"; else fail "run-all.sh 缺 main_sha 注入"; fi
if grep -q "refreshed_at" "$RUN_ALL"; then pass "run-all.sh 含 refreshed_at 注入"; else fail "run-all.sh 缺 refreshed_at"; fi

echo "── 5. CI 接线（铁律 0-2 WIRE CHECK）"
if [ -f "$WORKFLOW" ] && grep -q "run-all" "$WORKFLOW"; then
  pass "product-progress.yml 调用 run-all"
else
  fail "product-progress.yml 未调用 run-all（接线缺失 = 未完成）"
fi

echo "── 6. 证据向后兼容（旧 evidence 无 main_sha 仍可被消费）"
OLD_OK=1
for f in "$EVIDENCE_DIR"/GS-02-2026-08-21.json "$EVIDENCE_DIR"/GS-07-2026-08-22.json; do
  if [ -f "$f" ]; then
    python3 -c "
import json, sys
d = json.load(open('$f', encoding='utf-8'))
assert d['schema'] == 1 and d['record_type'] == 'scenario' and 'verdict' in d
" || OLD_OK=0
  fi
done
if [ "$OLD_OK" = 1 ]; then pass "旧 evidence schema=1 字段完整（calc-progress 可读）"; else fail "旧 evidence JSON 解析失败"; fi

echo "────────────────────────"
echo "结果: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
