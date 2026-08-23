#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# version-guard.test.sh — D511 版本守卫门禁测试（V4.10.0，组 14）
#
# 覆盖 (铁律 48: 正常/降级/边界 — dev doc §7.1/§7.3/§7.4):
#   L1 拦: 暂存门禁文件（scripts/control-tower/x.sh）无 VERSION.md → exit 1 + 点名
#   L1 拦: 暂存 scripts/pre-commit-check.sh 无 VERSION.md → exit 1（检测面核心成员）
#   L1 放行: 同 commit 门禁文件 + VERSION.md → exit 0
#   L1 放行: 纯文档（docs/xx.md）→ exit 0（零打扰，DOC_ONLY 边界）
#   L1 放行: 非门禁文件（src/xxx.ts、scripts/backup/、scripts/golden-scenarios/）→ exit 0（不误拦）
#   L1 边界: scripts/hooks/、scripts/check-*.sh、scripts/workflow/ 命中检测面（无 bump → 拦）
#   L1 边界: 仅 VERSION.md 无门禁文件 → exit 0（不要求成对反向）
#   L1 边界: 守卫自身新建 + VERSION.md 同 commit → exit 0（自身豁免不必要，§5.4-2 结论）
#   L2a 接线: pre-commit-check.sh 组 14 真实调用 check-version-guard.sh（铁律 0-2 WIRE CHECK）
#   L2a 接线: 组 14 位于 DOC_ONLY 早退之后（纯文档不触发，边界正确）
#   L2b 降级: SYNO_SKIP_VERSION_GUARD=1 → exit 0 + degraded-events.log 追加行（铁律 11 不静默）
#   L2b 降级: VERSION.md 缺失 / 无 `## V` 标题（不可解析）→ exit 2 fail-closed（D328/D331）
#
# 零真实仓库污染: mktemp 沙箱 + SYNO_STAGED_FILES/SYNO_CT_DIR 注入缝（ctrl-tower-change 模式 5）。
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
GUARD="$REPO_DIR/scripts/control-tower/check-version-guard.sh"
PRE_COMMIT="$REPO_DIR/scripts/pre-commit-check.sh"

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_contains() { if echo "$1" | grep -qF "$2"; then pass "$3"; else fail "$3 — 未找到: $2"; fi; }
assert_exit() { if [ "$1" = "$2" ]; then pass "$3 (exit=$2)"; else fail "$3 — 期望 exit=$1 实际=$2"; fi; }

TMP_DIR="$(mktemp -d /tmp/d511-version-guard-tests.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

# 沙箱控制塔目录: 合法 VERSION.md（V4.10.0 可解析基准）
CT_SANDBOX="$TMP_DIR/ct"
mkdir -p "$CT_SANDBOX/logs"
cat > "$CT_SANDBOX/VERSION.md" <<'EOF'
# 控制塔 VERSION
## V4.10.0 (2026-08-23) — D511 版本守卫门禁
测试沙箱基准条目。
EOF

run_guard() {  # $1 = 暂存清单（换行分隔字符串）
  SYNO_STAGED_FILES="$1" SYNO_CT_DIR="$CT_SANDBOX" bash "$GUARD" 2>&1
}

echo "═══════════════════════════════════════════════════════════"
echo "  D511 版本守卫门禁测试"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── 1. 拦: 门禁文件无 bump → exit 1 ──
echo "── 1. 拦: scripts/control-tower/x.sh 无 VERSION.md → exit 1 ──"
set +e
OUT=$(run_guard "scripts/control-tower/alloc-task-id.sh"); CODE=$?
set -e
assert_exit 1 "$CODE" "门禁文件变更无 bump 被硬阻断"
assert_contains "$OUT" "版本守卫" "输出点名守卫"

echo "── 2. 拦: scripts/pre-commit-check.sh 无 VERSION.md → exit 1 ──"
set +e
OUT=$(run_guard "scripts/pre-commit-check.sh"); CODE=$?
set -e
assert_exit 1 "$CODE" "pre-commit-check.sh 变更无 bump 被硬阻断"

# ── 3. 放行: 同 commit 带 VERSION.md bump ──
echo "── 3. 放行: 门禁文件 + VERSION.md 同 commit → exit 0 ──"
set +e
OUT=$(run_guard "scripts/pre-commit-check.sh
.codex/control-tower/VERSION.md"); CODE=$?
set -e
assert_exit 0 "$CODE" "门禁变更带同 commit bump 通过（规范§一铁律 2）"

# ── 4. 放行: 纯文档零打扰 ──
echo "── 4. 放行: 纯文档（docs/xx.md）→ exit 0 ──"
set +e
OUT=$(run_guard "docs/synova/notes/xx.md"); CODE=$?
set -e
assert_exit 0 "$CODE" "纯文档不触发守卫（DOC_ONLY 边界）"

# ── 5. 放行: 非门禁文件不误拦 ──
echo "── 5. 放行: 非门禁文件（src/、scripts/backup/、scripts/golden-scenarios/）→ exit 0 ──"
set +e
OUT=$(run_guard "src/routes/health.ts
scripts/backup/backup-db.sh
scripts/golden-scenarios/run.sh
scripts/product-lines/x.sh"); CODE=$?
set -e
assert_exit 0 "$CODE" "非门禁文件零打扰（检测面边界，dev doc §7.4）"

# ── 6. 边界: 检测面命中 scripts/hooks/、scripts/check-*.sh、scripts/workflow/ ──
echo "── 6. 边界: hooks/check-*/workflow 命中检测面（无 bump → 拦）──"
set +e
OUT=$(run_guard "scripts/hooks/pre-commit
scripts/check-secrets.sh
scripts/workflow/task-start.sh"); CODE=$?
set -e
assert_exit 1 "$CODE" "检测面成员无 bump 被拦"

# ── 7. 边界: 仅 VERSION.md 无门禁文件 → 不触发（不要求成对反向）──
echo "── 7. 边界: 仅 VERSION.md → exit 0 ──"
set +e
OUT=$(run_guard ".codex/control-tower/VERSION.md"); CODE=$?
set -e
assert_exit 0 "$CODE" "仅 VERSION.md 变更不触发守卫"

# ── 8. 边界: 守卫自身新建 + VERSION.md 同 commit → exit 0（§5.4-2：无需豁免自身）──
echo "── 8. 边界: 守卫自身首次暂存 + VERSION.md → exit 0 ──"
set +e
OUT=$(run_guard "scripts/control-tower/check-version-guard.sh
.codex/control-tower/VERSION.md"); CODE=$?
set -e
assert_exit 0 "$CODE" "守卫自身提交吃自己的药（同 commit bump）通过"

# ── 9. 降级: 逃生舱 SYNO_SKIP_VERSION_GUARD=1 → exit 0 + degraded-events.log 追加 ──
echo "── 9. 降级: 逃生舱跳过 + 显式记录（铁律 11）──"
DEGRADED_LOG="$CT_SANDBOX/logs/degraded-events.log"
BEFORE_LINES=$(grep -c . "$DEGRADED_LOG" 2>/dev/null | tr -d '\n\r' || true)
[ -z "$BEFORE_LINES" ] && BEFORE_LINES=0
set +e
OUT=$(SYNO_STAGED_FILES="scripts/pre-commit-check.sh" SYNO_CT_DIR="$CT_SANDBOX" \
  SYNO_SKIP_VERSION_GUARD=1 bash "$GUARD" 2>&1); CODE=$?
set -e
assert_exit 0 "$CODE" "逃生舱 exit 0"
AFTER_LINES=$(grep -c . "$DEGRADED_LOG" 2>/dev/null | tr -d '\n\r' || true)
[ -z "$AFTER_LINES" ] && AFTER_LINES=0
if [ "$AFTER_LINES" -gt "$BEFORE_LINES" ]; then
  pass "degraded-events.log 追加降级记录 ($BEFORE_LINES→$AFTER_LINES)"
else
  fail "degraded-events.log 未追加（静默降级，铁律 11 违规）"
fi

# ── 10. 降级: VERSION.md 缺失 → exit 2 fail-closed（D328/D331）──
echo "── 10. 降级: VERSION.md 缺失 → exit 2 fail-closed ──"
CT_EMPTY="$TMP_DIR/ct-empty"
mkdir -p "$CT_EMPTY/logs"
set +e
OUT=$(SYNO_STAGED_FILES="scripts/pre-commit-check.sh
.codex/control-tower/VERSION.md" SYNO_CT_DIR="$CT_EMPTY" bash "$GUARD" 2>&1); CODE=$?
set -e
assert_exit 2 "$CODE" "守卫自身降级不静默放行（exit 2 不与通过混同）"

# ── 11. 降级: VERSION.md 无 `## V` 标题（不可解析）→ exit 2 ──
echo "── 11. 降级: VERSION.md 不可解析 → exit 2 fail-closed ──"
CT_BAD="$TMP_DIR/ct-bad"
mkdir -p "$CT_BAD/logs"
echo "not a version file" > "$CT_BAD/VERSION.md"
set +e
OUT=$(SYNO_STAGED_FILES="scripts/pre-commit-check.sh" SYNO_CT_DIR="$CT_BAD" bash "$GUARD" 2>&1); CODE=$?
set -e
assert_exit 2 "$CODE" "不可解析 VERSION.md → fail-closed"

# ── 12. 接线: pre-commit 组 14 真实调用（铁律 0-2 WIRE CHECK）──
echo "── 12. 接线: 组 14 调用存在 ──"
WIRE=$(grep -n "check-version-guard" "$PRE_COMMIT" || true)
if [ -n "$WIRE" ]; then
  pass "pre-commit-check.sh 组 14 调用: $(echo "$WIRE" | head -1 | cut -c1-80)"
else
  fail "pre-commit-check.sh 零调用 check-version-guard — 未接线（铁律 0-2）"
fi

# ── 13. 接线位置: 组 14 在 DOC_ONLY 早退之后 ──
echo "── 13. 接线: 组 14 位于 DOC_ONLY 早退之后 ──"
DOC_LINE=$(grep -n 'if \[ "$DOC_ONLY" -eq 1 \]' "$PRE_COMMIT" | head -1 | cut -d: -f1)
GUARD_LINE=$(grep -n "check-version-guard" "$PRE_COMMIT" | head -1 | cut -d: -f1)
if [ -n "$DOC_LINE" ] && [ -n "$GUARD_LINE" ] && [ "$GUARD_LINE" -gt "$DOC_LINE" ]; then
  pass "组 14 (L$GUARD_LINE) 在 DOC_ONLY 早退 (L$DOC_LINE) 之后 — 纯文档天然豁免"
else
  fail "组 14 位置错误: DOC_ONLY=L$DOC_LINE GUARD=L$GUARD_LINE"
fi

# ── 结果 ──
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  结果: PASS=$PASS FAIL=$FAIL"
echo "═══════════════════════════════════════════════════════════"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
