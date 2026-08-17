#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# verify-claims-table.test.sh — U4 声称↔证据对照表校验测试（格式版）
#
# 覆盖 (铁律 48 正常/降级/边界):
#   1. 对照表完整 + 白名单命令 → exit 0
#   2. 有声称无证据 → exit 1 点名
#   3. 证据命令为空 → exit 1
#   4. 非白名单命令 (rm) → exit 1
#   5. 危险元字符 (; $) → exit 1
#   6. 无交付声明节 → exit 0 (跳过)
#   7. doc 不存在 → exit 2 (降级)
# 用法: bash tests/control-tower/verify-claims-table.test.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TOOL="$REPO_DIR/scripts/control-tower/verify-claims-table.sh"
TMP_DIR="$REPO_DIR/.codex/control-tower/tmp"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_exit() { # assert_exit <expected> <actual> <msg>
  if [ "$1" = "$2" ]; then pass "$3 (exit=$2)"; else fail "$3 — 期望 exit=$1 实际=$2"; fi
}

mkdir -p "$TMP_DIR"
rm -f "$TMP_DIR"/ct-*.md

echo "═══════════════════════════════════════════════════════════"
echo "  U4 verify-claims-table 测试 — 声称↔证据对照表校验"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── 场景 1: 完整表 + 白名单命令 → exit 0 ──
echo "── 场景 1: 完整表 + 白名单 → exit 0 ──"
cat > "$TMP_DIR/ct-1.md" <<'EOF'
# Dev Doc
## 交付声明
| 声称 | 证据命令 | 预期 |
|------|:---:|------|
| transitionFindingStatus 已接线 | grep -rn "transitionFindingStatus" src/ \| grep -v test | 非空 |
| 测试通过 | vitest run tests/foo | 24 绿 |
EOF
EXIT=0
OUT=$(bash "$TOOL" "$TMP_DIR/ct-1.md" 2>&1) || EXIT=$?
assert_exit 0 "$EXIT" "完整表 → exit 0"

# ── 场景 2: 有声称无证据 → exit 1 ──
echo "── 场景 2: 有声称无证据 → exit 1 ──"
cat > "$TMP_DIR/ct-2.md" <<'EOF'
# Dev Doc
## 交付声明
| 声称 | 证据命令 | 预期 |
|------|:---:|------|
| 某函数已接线 | | 非空 |
EOF
EXIT=0
OUT=$(bash "$TOOL" "$TMP_DIR/ct-2.md" 2>&1) || EXIT=$?
assert_exit 1 "$EXIT" "缺证据命令 → exit 1"
echo "$OUT" | grep -q "缺证据命令" && pass "点名缺证据" || fail "未点名缺证据"

# ── 场景 3: 非白名单命令 → exit 1 ──
echo "── 场景 3: 非白名单命令 (rm) → exit 1 ──"
cat > "$TMP_DIR/ct-3.md" <<'EOF'
# Dev Doc
## 交付声明
| 声称 | 证据命令 | 预期 |
|------|:---:|------|
| 清理完成 | rm -rf /tmp/x | 无输出 |
EOF
EXIT=0
OUT=$(bash "$TOOL" "$TMP_DIR/ct-3.md" 2>&1) || EXIT=$?
assert_exit 1 "$EXIT" "非白名单命令 → exit 1"
echo "$OUT" | grep -q "非白名单" && pass "点名非白名单" || fail "未点名非白名单"

# ── 场景 4: 危险元字符 → exit 1 ──
echo "── 场景 4: 危险元字符 (;) → exit 1 ──"
cat > "$TMP_DIR/ct-4.md" <<'EOF'
# Dev Doc
## 交付声明
| 声称 | 证据命令 | 预期 |
|------|:---:|------|
| 已部署 | grep x; rm -rf / | 非空 |
EOF
EXIT=0
OUT=$(bash "$TOOL" "$TMP_DIR/ct-4.md" 2>&1) || EXIT=$?
assert_exit 1 "$EXIT" "危险元字符 → exit 1"
echo "$OUT" | grep -q "危险字符" && pass "点名危险字符" || fail "未点名危险字符"

# ── 场景 5: 无交付声明节 → exit 0 (跳过) ──
echo "── 场景 5: 无交付声明节 → exit 0 (跳过) ──"
cat > "$TMP_DIR/ct-5.md" <<'EOF'
# Dev Doc
## 3. 实现方案
### 3.1 写集
| 文件 | 操作 |
|------|:---:|
| src/foo.ts | 修改 |
EOF
EXIT=0
OUT=$(bash "$TOOL" "$TMP_DIR/ct-5.md" 2>&1) || EXIT=$?
assert_exit 0 "$EXIT" "无交付声明节 → exit 0 (跳过)"

# ── 场景 6: doc 不存在 → exit 2 ──
echo "── 场景 6: doc 不存在 → exit 2 ──"
EXIT=0
OUT=$(bash "$TOOL" "$TMP_DIR/not-exist.md" 2>&1) || EXIT=$?
assert_exit 2 "$EXIT" "doc 不存在 → exit 2 (降级)"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  结果: $PASS 通过, $FAIL 失败"
if [ "$FAIL" -gt 0 ]; then
  echo "  Status: ❌ verify-claims-table 测试未通过"
  exit 1
fi
echo "  Status: ✅ verify-claims-table 测试全部通过"
exit 0
