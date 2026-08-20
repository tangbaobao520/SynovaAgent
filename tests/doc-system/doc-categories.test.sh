#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# doc-categories.test.sh — 九类沉淀索引生成器测试（铁律 48：正常/边界/降级三路径）
# 用例: A 各类计数正确（14 文件 11 类） | B 目录不存在→1
# 运行: bash tests/doc-system/doc-categories.test.sh
# ═══════════════════════════════════════════════════════════════════════════════
set +e
SCRIPT="$(cd "$(dirname "$0")/../.." && pwd)/scripts/doc-system/doc-categories.sh"
PASS=0; FAIL=0

t() { # $1=用例名 $2=期望 $3=实际
  if [ "$2" = "$3" ]; then echo "  ✅ $1 (exit $3)"; PASS=$((PASS+1)); else echo "  ❌ $1 (期望 $2 实际 $3)"; FAIL=$((FAIL+1)); fi
}

FIX=$(mktemp -d)
trap 'rm -rf "$FIX"' EXIT
mkdir -p "$FIX/docs/authority" "$FIX/docs/archive" "$FIX/docs/research" \
         "$FIX/docs/synova/audit-reports" "$FIX/docs/synova/coordination" \
         "$FIX/docs/plans" "$FIX/knowledge" "$FIX/memory" "$FIX/theory"
: > "$FIX/docs/authority/a.md"          # governance
: > "$FIX/docs/archive/b.md"            # archive
: > "$FIX/docs/research/c.md"           # research
: > "$FIX/docs/synova/audit-reports/d.md"  # retrospective
: > "$FIX/docs/synova/coordination/e.md"   # devdoc
: > "$FIX/docs/plans/f.md"              # draft
: > "$FIX/docs/DECISION-g.md"           # decision
: > "$FIX/knowledge/h.md"               # knowledge
: > "$FIX/memory/session-s.md"          # diary
: > "$FIX/memory/pit-lesson.md"         # pitfall
: > "$FIX/WORKLOG-20260801.md"          # diary
: > "$FIX/AGENTS.md"                    # devdoc
: > "$FIX/AUDIT-X.md"                   # retrospective
: > "$FIX/OTHER.md"                     # unclassified

OUT=$(DOC_TRUTH_ROOT="$FIX" bash "$SCRIPT" 2>&1); RC=$?
t "A 索引 exit0" 0 $RC
echo "$OUT" | grep -q '总文件: 14';      t "A1 总数=14" 0 $?
echo "$OUT" | grep -q 'governance (1)';  t "A2 governance=1" 0 $?
echo "$OUT" | grep -q 'archive (1)';     t "A3 archive=1" 0 $?
echo "$OUT" | grep -q 'research (1)';    t "A4 research=1" 0 $?
echo "$OUT" | grep -q 'retrospective (2)'; t "A5 retrospective=2" 0 $?
echo "$OUT" | grep -q 'devdoc (2)';      t "A6 devdoc=2" 0 $?
echo "$OUT" | grep -q 'draft (1)';       t "A7 draft=1" 0 $?
echo "$OUT" | grep -q 'decision (1)';    t "A8 decision=1" 0 $?
echo "$OUT" | grep -q 'diary (2)';       t "A9 diary=2" 0 $?
echo "$OUT" | grep -q 'pitfall (1)';     t "A10 pitfall=1" 0 $?
echo "$OUT" | grep -q 'knowledge (1)';   t "A11 knowledge=1" 0 $?
echo "$OUT" | grep -q 'unclassified (1)'; t "A12 unclassified=1" 0 $?

DOC_TRUTH_ROOT="$FIX" bash "$SCRIPT" nonexistent >/dev/null 2>&1; t "B 目录不存在" 1 $?

echo "── 汇总: $PASS 通过 / $FAIL 失败 ──"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
