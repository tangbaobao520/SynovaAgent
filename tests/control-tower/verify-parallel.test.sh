#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# verify-parallel.test.sh — D311 并行声明物理验证测试
#
# 5 场景（铁律 48：正常/降级/边界）:
#   1. 共享 1 文件 → exit 1 + 重叠文件 + 两个 doc 路径
#   2. 零交集 → exit 0 + status=pass
#   3. 链接/反斜杠/行号清洗 → 清洗后命中为冲突
#   4. 目录 vs 文件 → 目录级冲突 exit 1
#   5. fail-open: doc 不存在 → exit 0 + stderr 非空 + degraded-events.log 记录
#
# 用法: bash tests/control-tower/verify-parallel.test.sh
# 退出码: 0 = 全部通过
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TOOL="$REPO_DIR/scripts/control-tower/verify-parallel.sh"
TMP_DIR="$REPO_DIR/.codex/control-tower/tmp"
DEGRADED_LOG="$REPO_DIR/.codex/control-tower/logs/degraded-events.log"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_exit() { # assert_exit <expected> <actual> <msg>
  if [ "$1" = "$2" ]; then
    pass "$3 (exit=$2)"
  else
    fail "$3 — 期望 exit=$1 实际=$2"
  fi
}
assert_contains() { # assert_contains <haystack> <needle> <msg>
  if echo "$1" | grep -qF "$2"; then
    pass "$3"
  else
    fail "$3 — 输出中未找到: $2"
  fi
}

mkdir -p "$TMP_DIR"
rm -f "$TMP_DIR"/vp-*.md "$DEGRADED_LOG" 2>/dev/null || true

echo "═══════════════════════════════════════════════════════════"
echo "  D311 verify-parallel 测试 — 并行声明物理验证"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── 场景 1: 共享 1 文件 → 拦截 ──
echo "── 场景 1: 共享文件被拦 ──"
cat > "$TMP_DIR/vp-a.md" <<'EOF'
<!-- 并行: D100 (src/), D200 (tests/) — 零共享文件 -->
# Doc A
### 3.1 写集 (1 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| src/agent/diagnosis-launcher.ts | 修改 | 测试共享 |
EOF
cat > "$TMP_DIR/vp-b.md" <<'EOF'
<!-- 并行: D100 (src/), D200 (tests/) — 零共享文件 -->
# Doc B
### 3.1 写集 (1 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| src/agent/diagnosis-launcher.ts | 修改 | 测试共享 |
EOF
OUT=$(bash "$TOOL" --doc-a "$TMP_DIR/vp-a.md" --doc-b "$TMP_DIR/vp-b.md" --json 2>&1) || EXIT=$?
EXIT="${EXIT:-0}"
assert_exit 1 "$EXIT" "共享文件 → exit 1"
assert_contains "$OUT" "diagnosis-launcher.ts" "输出含重叠文件"
assert_contains "$OUT" "vp-a.md" "输出含 doc A 路径"
assert_contains "$OUT" "vp-b.md" "输出含 doc B 路径"
echo ""

# ── 场景 2: 零交集 → 放行 ──
echo "── 场景 2: 零交集放行 ──"
cat > "$TMP_DIR/vp-a2.md" <<'EOF'
### 3.1 写集 (1 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| src/agent/a.ts | 修改 | 测试 |
EOF
cat > "$TMP_DIR/vp-b2.md" <<'EOF'
### 3.1 写集 (1 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| src/agent/b.ts | 修改 | 测试 |
EOF
EXIT=0
OUT=$(bash "$TOOL" --doc-a "$TMP_DIR/vp-a2.md" --doc-b "$TMP_DIR/vp-b2.md" --json 2>&1) || EXIT=$?
assert_exit 0 "$EXIT" "零交集 → exit 0"
assert_contains "$OUT" '"status": "pass"' "status=pass"
echo ""

# ── 场景 3: 链接/反斜杠/行号清洗 → 命中为冲突 ──
echo "── 场景 3: 链接/行号清洗命中 ──"
cat > "$TMP_DIR/vp-a3.md" <<'EOF'
### 3.1 写集 (1 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| [src\deploy\bootstrap.ts L750](D:\repo\synova-agent\src\deploy\bootstrap.ts:750) | 修改 | 链接形态 |
EOF
cat > "$TMP_DIR/vp-b3.md" <<'EOF'
### 3.1 写集 (1 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| src/deploy/bootstrap.ts | 修改 | 纯路径 |
EOF
EXIT=0
OUT=$(bash "$TOOL" --doc-a "$TMP_DIR/vp-a3.md" --doc-b "$TMP_DIR/vp-b3.md" --json 2>&1) || EXIT=$?
assert_exit 1 "$EXIT" "清洗后命中 → exit 1"
assert_contains "$OUT" "bootstrap.ts" "输出含清洗后的文件名"
echo ""

# ── 场景 4: 目录 vs 文件 → 目录级冲突 ──
echo "── 场景 4: 目录级冲突 ──"
cat > "$TMP_DIR/vp-a4.md" <<'EOF'
### 3.1 写集 (1 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| src/routes/ | 修改 | 目录级 |
EOF
cat > "$TMP_DIR/vp-b4.md" <<'EOF'
### 3.1 写集 (1 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| src/routes/ga.ts | 修改 | 文件级 |
EOF
EXIT=0
OUT=$(bash "$TOOL" --doc-a "$TMP_DIR/vp-a4.md" --doc-b "$TMP_DIR/vp-b4.md" --json 2>&1) || EXIT=$?
assert_exit 1 "$EXIT" "目录 vs 文件 → exit 1"
assert_contains "$OUT" "routes" "输出含目录名"
echo ""

# ── 场景 5: fail-open — doc 不存在 ──
echo "── 场景 5: fail-open（doc 不存在）──"
EXIT=0
OUT=$(bash "$TOOL" --doc-a "$TMP_DIR/not-exist.md" --doc-b "$TMP_DIR/vp-a.md" --json 2>&1) || EXIT=$?
assert_exit 0 "$EXIT" "doc 不存在 → exit 0（fail-open）"
assert_contains "$OUT" "SKIP" "输出含 SKIP 标记"
if [ -f "$DEGRADED_LOG" ]; then
  pass "degraded-events.log 有记录"
else
  fail "degraded-events.log 缺失"
fi
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  结果: $PASS 通过, $FAIL 失败"
if [ "$FAIL" -gt 0 ]; then
  echo "  Status: ❌ verify-parallel 测试未通过"
  echo "═══════════════════════════════════════════════════════════"
  exit 1
fi
echo "  Status: ✅ verify-parallel 测试全部通过"
echo "═══════════════════════════════════════════════════════════"
exit 0
