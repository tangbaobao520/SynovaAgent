#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# doc-staleness.test.sh — 过期标记脚本测试（铁律 48：正常/边界/降级三路径）
# 用例: A 全新鲜→0 | B 过期→1 | C 缺失文档不判失败→0
# 运行: bash tests/doc-system/doc-staleness.test.sh
# ═══════════════════════════════════════════════════════════════════════════════
set +e
SCRIPT="$(cd "$(dirname "$0")/../.." && pwd)/scripts/doc-system/doc-staleness.sh"
PASS=0; FAIL=0

t() { # $1=用例名 $2=期望 $3=实际
  if [ "$2" = "$3" ]; then echo "  ✅ $1 (exit $3)"; PASS=$((PASS+1)); else echo "  ❌ $1 (期望 $2 实际 $3)"; FAIL=$((FAIL+1)); fi
}

FIX=$(mktemp -d)
trap 'rm -rf "$FIX"' EXIT
mkdir -p "$FIX/docs/authority"
for f in INDEX.md CHRONICLE.md START-HERE.md docs/authority/PRD.md docs/authority/ARCHITECTURE.md docs/authority/STATUS.md docs/authority/DOCS-REGISTRY.yaml docs/authority/GOVERNANCE.md docs/authority/DRIFT-LEDGER.md; do
  mkdir -p "$FIX/$(dirname "$f")"; : > "$FIX/$f"
done

# A: 全新鲜（今天创建）→ exit 0
DOC_STALENESS_DAYS=90 DOC_TRUTH_ROOT="$FIX" bash "$SCRIPT" >/dev/null 2>&1; t "A 全新鲜" 0 $?

# B: 把 PRD 改成 200 天前 → exit 1
touch -d '200 days ago' "$FIX/docs/authority/PRD.md"
OUT=$(DOC_STALENESS_DAYS=90 DOC_TRUTH_ROOT="$FIX" bash "$SCRIPT" 2>&1); RC=$?
t "B 有过期" 1 $RC
echo "$OUT" | grep -q '过期: docs/authority/PRD.md'; t "B1 点名过期文件" 0 $?

# C: 缺失文档 → ⚠️ 提示但 exit 0（先恢复 PRD 新鲜度，只测"缺失不判失败"）
touch "$FIX/docs/authority/PRD.md"
rm "$FIX/INDEX.md"
DOC_STALENESS_DAYS=90 DOC_TRUTH_ROOT="$FIX" bash "$SCRIPT" >/dev/null 2>&1; t "C 缺失不判失败" 0 $?

echo "── 汇总: $PASS 通过 / $FAIL 失败 ──"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
