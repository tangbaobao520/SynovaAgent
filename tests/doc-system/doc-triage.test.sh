#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# doc-triage.test.sh — 一次性盘点脚本测试（铁律 48：正常/边界/降级三路径）
# 用例: A 五类分类计数正确 | A1-A5 各分类计数 | B 目录不存在→1
# 运行: bash tests/doc-system/doc-triage.test.sh
# ═══════════════════════════════════════════════════════════════════════════════
set +e
SCRIPT="$(cd "$(dirname "$0")/../.." && pwd)/scripts/doc-system/doc-triage.sh"
PASS=0; FAIL=0

t() { # $1=用例名 $2=期望 $3=实际
  if [ "$2" = "$3" ]; then echo "  ✅ $1 (exit $3)"; PASS=$((PASS+1)); else echo "  ❌ $1 (期望 $2 实际 $3)"; FAIL=$((FAIL+1)); fi
}

FIX=$(mktemp -d)
trap 'rm -rf "$FIX"' EXIT
mkdir -p "$FIX/docs/archive" "$FIX/docs/sub"
printf 'keep.md\n' > "$FIX/INDEX.md"
: > "$FIX/CHRONICLE.md"; : > "$FIX/START-HERE.md"
mkdir -p "$FIX/docs/authority"; : > "$FIX/docs/authority/DOCS-REGISTRY.yaml"
: > "$FIX/docs/keep.md"        # 被 INDEX 引用 → KEEP
: > "$FIX/docs/archive/old.md"  # archive 路径 → ARCH
: > "$FIX/docs/_tmp-scratch.md" # 临时名 → DEL
: > "$FIX/docs/new.md"          # 今天 → NEW
: > "$FIX/docs/unk.md"; touch -d '60 days ago' "$FIX/docs/unk.md"  # 60 天 → UNK

OUT=$(DOC_TRUTH_ROOT="$FIX" bash "$SCRIPT" 2>&1); RC=$?
t "A 盘点 exit0" 0 $RC
echo "$OUT" | grep -q 'KEEP保留 1'; t "A1 KEEP计数=1" 0 $?
echo "$OUT" | grep -q 'ARCH归档候选 1'; t "A2 ARCH计数=1" 0 $?
echo "$OUT" | grep -q 'DEL删除候选 1'; t "A3 DEL计数=1" 0 $?
echo "$OUT" | grep -q 'NEW观察 1'; t "A4 NEW计数=1" 0 $?
echo "$OUT" | grep -q 'UNK待人工 1'; t "A5 UNK计数=1" 0 $?
echo "$OUT" | grep -q '总文件: 5'; t "A6 总文件=5" 0 $?

DOC_TRUTH_ROOT="$FIX" bash "$SCRIPT" nonexistent >/dev/null 2>&1; t "B 目录不存在" 1 $?

echo "── 汇总: $PASS 通过 / $FAIL 失败 ──"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
