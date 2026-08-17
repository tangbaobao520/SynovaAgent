#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# write-set-check.test.sh — D313 M3b dev doc 写集验证测试
#
# 覆盖（铁律 48：正常/降级/边界）:
#   1. 声明 3 文件，2 命中 → 漂移 1 + exit 1
#   2. 声明全命中 → exit 0 + 漂移 0
#   3. 无写集表 → exit 1（U2b fail-closed: 有 dev doc 无写集表 = 契约违例）
#   4. 链接/反斜杠/行号形态清洗后命中
#   5. 目录级声明 vs 实际 → 漂移判定正确
#
# 全部走 SYNO_DEV_DOC 注入缝（不跑真实 git diff 对历史 doc）。
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TOOL="$REPO_DIR/scripts/workflow/check-dev-doc-write-set.sh"
TMP_DIR="$REPO_DIR/.codex/control-tower/tmp"

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_contains() { if echo "$1" | grep -qF "$2"; then pass "$3"; else fail "$3 — 未找到: $2"; fi; }
assert_exit() { if [ "$1" = "$2" ]; then pass "$3 (exit=$2)"; else fail "$3 — 期望 exit=$1 实际=$2"; fi; }

mkdir -p "$TMP_DIR"
rm -f "$TMP_DIR"/ws-*.md 2>/dev/null || true

echo "═══════════════════════════════════════════════════════════"
echo "  D313 write-set-check 测试 — dev doc 写集验证"
echo "═══════════════════════════════════════════════════════════"
echo ""

# 注入缝: SYNO_DEV_DOC_DIR 指向真实仓库文件存在的目录
# 场景 1/2: 用真实存在的文件做声明（scripts/ 下文件存在）
echo "── 1. 声明 3 文件，2 命中 → 漂移 1 ──"
cat > "$TMP_DIR/ws-doc1.md" <<'EOF'
# Test Doc
### 3.1 写集 (2 修改 + 1 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| scripts/pre-push-check.sh | 修改 | 存在+可能已改 |
| scripts/control-tower/session_registry.py | 修改 | 存在 |
| src/does-not-exist-xyz.ts | 新建 | 不存在 → 漂移 |
EOF
EXIT=0
OUT=$(SYNO_DEV_DOC="$TMP_DIR/ws-doc1.md" bash "$TOOL" --json 2>&1) || EXIT=$?
assert_exit 1 "$EXIT" "漂移 1 条 → exit 1"
assert_contains "$OUT" "does-not-exist-xyz" "输出含漂移文件"
echo ""

echo "── 2. 声明全命中 → exit 0 ──"
cat > "$TMP_DIR/ws-doc2.md" <<'EOF'
# Test Doc
### 3.1 写集 (2 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| scripts/pre-push-check.sh | 修改 | 存在 |
| scripts/control-tower/session_registry.py | 修改 | 存在 |
EOF
EXIT=0
OUT=$(SYNO_DEV_DOC="$TMP_DIR/ws-doc2.md" bash "$TOOL" --json 2>&1) || EXIT=$?
assert_exit 0 "$EXIT" "全命中 → exit 0"
assert_contains "$OUT" "漂移 0" "输出含漂移 0"
echo ""

echo "── 3. 无写集表 → exit 1（U2b 修复: 有 dev doc 无写集表 = 契约违例）──"
cat > "$TMP_DIR/ws-doc3.md" <<'EOF'
# Test Doc
没有写集表章节
EOF
EXIT=0
OUT=$(SYNO_DEV_DOC="$TMP_DIR/ws-doc3.md" bash "$TOOL" 2>&1) || EXIT=$?
assert_exit 1 "$EXIT" "无写集表 → exit 1（U2b fail-closed）"
assert_contains "$OUT" "无写集表" "输出点名无写集表"
echo ""

echo "── 4. 链接/反斜杠/行号清洗 ──"
cat > "$TMP_DIR/ws-doc4.md" <<'EOF'
# Test Doc
### 3.1 写集 (1 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| [src\deploy\bootstrap.ts L750](D:\repo\synova-agent\src\deploy\bootstrap.ts:750) | 修改 | 链接形态 |
EOF
EXIT=0
OUT=$(SYNO_DEV_DOC="$TMP_DIR/ws-doc4.md" bash "$TOOL" --json 2>&1) || EXIT=$?
# bootstrap.ts 真实存在 → 清洗后识别为 1 条且漂移 0（存在性检查过）
assert_contains "$OUT" "声明 1 条" "链接/行号清洗后识别 1 条"
assert_contains "$OUT" "漂移 0" "bootstrap.ts 存在 → 漂移 0"
echo ""

echo "── 5. 目录级声明 ──"
cat > "$TMP_DIR/ws-doc5.md" <<'EOF'
# Test Doc
### 3.1 写集 (1 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| scripts/control-tower/ | 修改 | 目录级 |
EOF
EXIT=0
OUT=$(SYNO_DEV_DOC="$TMP_DIR/ws-doc5.md" bash "$TOOL" --json 2>&1) || EXIT=$?
assert_contains "$OUT" "control-tower" "目录级声明被识别"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  结果: $PASS 通过, $FAIL 失败"
if [ "$FAIL" -gt 0 ]; then
  echo "  Status: ❌ write-set-check 测试未通过"
  echo "═══════════════════════════════════════════════════════════"
  exit 1
fi
echo "  Status: ✅ write-set-check 测试全部通过"
echo "═══════════════════════════════════════════════════════════"
exit 0
