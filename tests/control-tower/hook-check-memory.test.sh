#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# hook-check-memory.test.sh — D472 hook-check-memory.sh 注入过滤测试
#
# 覆盖 (铁律 48: 正常/降级/边界):
#   1. 注入过滤: archived/ 下 Note 零注入（K3 §4.2 "archived/rejected 不注入"）
#   2. 注入过滤: implemented/ 下 Note 正常注入（活教训，read 活态）
#   3. 边界: 无今日 task brief → 跳过注入（exit 0 不阻断）
#
# 零真实仓库污染: 临时沙箱构造 memory/notes/ 四态 + task brief。
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$REPO_DIR/scripts/hooks/hook-check-memory.sh"
TMP_DIR="/tmp/d472-hook-check-memory-tests"

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_contains() { if echo "$1" | grep -qF "$2"; then pass "$3"; else fail "$3 — 未找到: $2"; fi; }
assert_not_contains() { if echo "$1" | grep -qF "$2"; then fail "$3 — 不应包含: $2"; else pass "$3"; fi; }

# ── 沙箱构造（含 git 仓库 — hook 用 git rev-parse 定位 ROOT）──
rm -rf "$TMP_DIR" 2>/dev/null || true
mkdir -p "$TMP_DIR/memory/notes/proposed" "$TMP_DIR/memory/notes/implemented" "$TMP_DIR/memory/notes/archived" "$TMP_DIR/memory/notes/rejected"
mkdir -p "$TMP_DIR/.claude/task-briefs"

echo "═══════════════════════════════════════════════════════════"
echo "  D472 hook-check-memory.sh 注入过滤测试"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── 1. 注入过滤: archived 零注入 + implemented 正常注入 ──
echo "── 1. 注入过滤: archived/ 零注入 + implemented/ 注入 ──"
cat > "$TMP_DIR/memory/notes/archived/2026-08-01-old-lesson.md" <<'EOF'
---
状态: archived
日期: 2026-08-01
决策: 旧教训
理由: 历史
---
**Why:** 这是一个 archived 旧教训，含关键词 sentinel
EOF
cat > "$TMP_DIR/memory/notes/implemented/2026-08-20-live-lesson.md" <<'EOF'
---
状态: implemented
日期: 2026-08-20
决策: 活教训
理由: 现行
---
**Why:** 这是一个 implemented 活教训，含关键词 sentinel
EOF
# task brief 含 sentinel 关键词 → 触发注入路径
BRIEF_DATE=$(date +%Y-%m-%d)
cat > "$TMP_DIR/.claude/task-briefs/${BRIEF_DATE}-test.md" <<'EOF'
## Q0: 定位 — 测试 sentinel 关键词
## Q1: 调研 — 测试
## Q2: 范围 — 测试
## Q3: 验收 — 测试
## 架构层:
基础设施
## Done 标准
- [x] verify: echo ok
EOF
(
  cd "$TMP_DIR" && git init -q 2>/dev/null && git add -A 2>/dev/null
)
OUT=$(cd "$TMP_DIR" && bash "$HOOK" 2>&1 || true)
assert_not_contains "$OUT" "old-lesson" "archived/ 教训零注入"
assert_contains "$OUT" "live-lesson" "implemented/ 教训正常注入"
echo ""

# ── 2. 边界: 无今日 task brief → 跳过（exit 0 不阻断）──
echo "── 2. 边界: 无今日 task brief → 跳过 ──"
rm -f "$TMP_DIR/.claude/task-briefs/"*.md 2>/dev/null || true
set +e
OUT=$(cd "$TMP_DIR" && bash "$HOOK" 2>&1)
CODE=$?
set -e
if [ "$CODE" -eq 0 ]; then pass "无 brief → exit 0"; else fail "无 brief → exit 0 — 实际=$CODE"; fi
assert_contains "$OUT" "跳过" "显式提示跳过"
echo ""

# ═══ 结果 ═══
echo "═══════════════════════════════════════════════════════════"
echo "  结果: $PASS 通过, $FAIL 失败"
echo "═══════════════════════════════════════════════════════════"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
