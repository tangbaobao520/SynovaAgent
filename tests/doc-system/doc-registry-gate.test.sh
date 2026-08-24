#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# doc-registry-gate.test.sh — 登记门禁脚本测试（铁律 48：正常/边界/降级三路径）
# 用例: A 检出未登记→1 | B 全登记→0 | C registry 缺失降级→0 | D 排除生效→0
# 运行: bash tests/doc-system/doc-registry-gate.test.sh
# ═══════════════════════════════════════════════════════════════════════════════
set +e
SCRIPT="$(cd "$(dirname "$0")/../.." && pwd)/scripts/doc-system/doc-registry-gate.sh"
PASS=0; FAIL=0

t() { # $1=用例名 $2=期望 $3=实际
  if [ "$2" = "$3" ]; then echo "  ✅ $1 (exit $3)"; PASS=$((PASS+1)); else echo "  ❌ $1 (期望 $2 实际 $3)"; FAIL=$((FAIL+1)); fi
}

FIX=$(mktemp -d)
trap 'rm -rf "$FIX"' EXIT
mkdir -p "$FIX/docs/authority" "$FIX/docs/archive"
: > "$FIX/a.md"; : > "$FIX/docs/good.md"; : > "$FIX/docs/bad.md"; : > "$FIX/docs/archive/hist.md"

# A: registry 只登记 a.md + good.md → bad.md 未登记 → exit 1
cat > "$FIX/docs/authority/DOCS-REGISTRY.yaml" <<'EOF'
documents:
  - id: T1
    type: prd
    path: a.md
  - id: T2
    type: prd
    path: docs/good.md
EOF
DOC_TRUTH_ROOT="$FIX" bash "$SCRIPT" >/dev/null 2>&1; t "A 检出未登记" 1 $?

# B: 补登记 bad.md → exit 0
printf '  - id: T3\n    type: prd\n    path: docs/bad.md\n' >> "$FIX/docs/authority/DOCS-REGISTRY.yaml"
DOC_TRUTH_ROOT="$FIX" bash "$SCRIPT" >/dev/null 2>&1; t "B 全登记通过" 0 $?

# C: registry 缺失 → 降级 exit 0
mv "$FIX/docs/authority/DOCS-REGISTRY.yaml" "$FIX/docs/authority/.bak"
DOC_TRUTH_ROOT="$FIX" bash "$SCRIPT" >/dev/null 2>&1; t "C registry缺失降级" 0 $?
mv "$FIX/docs/authority/.bak" "$FIX/docs/authority/DOCS-REGISTRY.yaml"

# D: archive 路径排除 → 即使未登记也不报 → exit 0（bad.md 已登记）
DOC_TRUTH_ROOT="$FIX" bash "$SCRIPT" >/dev/null 2>&1; t "D 排除+全登记" 0 $?

# E: git 模式 — staged 新增未登记 → exit 1（提交场景核心：git add 后 ls-files --others 看不到）
git -C "$FIX" init -q 2>/dev/null # swallow-ok:
git -C "$FIX" config user.email t@t 2>/dev/null # swallow-ok:
git -C "$FIX" config user.name t 2>/dev/null # swallow-ok:
git -C "$FIX" add a.md docs/good.md docs/bad.md 2>/dev/null # swallow-ok:
: > "$FIX/docs/new.md"
git -C "$FIX" add docs/new.md 2>/dev/null # swallow-ok:
DOC_TRUTH_ROOT="$FIX" bash "$SCRIPT" >/dev/null 2>&1; t "E git模式检出staged未登记" 1 $?

# F: 补登记 new.md → git 模式全登记 → exit 0
printf '  - id: T4\n    type: prd\n    path: docs/new.md\n' >> "$FIX/docs/authority/DOCS-REGISTRY.yaml"
DOC_TRUTH_ROOT="$FIX" bash "$SCRIPT" >/dev/null 2>&1; t "F git模式全登记通过" 0 $?

# G: tmp/ 临时区排除 → 即使未登记也不报 → exit 0
mkdir -p "$FIX/tmp"
: > "$FIX/tmp/scratch.md"
DOC_TRUTH_ROOT="$FIX" bash "$SCRIPT" >/dev/null 2>&1; t "G tmp临时区排除" 0 $?

# W: 生产接线检查（铁律 0-2 WIRE CHECK — doc-system 脚本已被 pre-commit 调用）
PRE_COMMIT="$(cd "$(dirname "$0")/../.." && pwd)/scripts/pre-commit-check.sh"
grep -q "doc-registry-gate.sh" "$PRE_COMMIT"; t "W1 接线: registry-gate 在 pre-commit" 0 $?
grep -q "check-doc-truth.sh" "$PRE_COMMIT"; t "W2 接线: check-doc-truth 在 pre-commit" 0 $?

echo "── 汇总: $PASS 通过 / $FAIL 失败 ──"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
