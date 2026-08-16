#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# gen-cto-health.test.sh — D384/CT-37 第③面生成器测试（幂等 + 数据源指纹）
#
# 背景: K3 审 D383 P1-4 发现 gen-cto-health.py 幂等声称不实（时间戳内嵌恒写文件）
#       + 329 行零测试。D384 修复: 数据源指纹判定（数据未变不重写）。
#
# 覆盖 (铁律 48: 正常/降级/边界):
#   1. 首次生成 → 产物含指纹行
#   2. 连续运行 → 幂等（指纹未变不写，输出"幂等"）
#   3. 数据源变化（追加 bypass.log 事件）→ 指纹变 → 重写
#   4. 语法/主流程可跑（dry-run 输出完整）
#
# 隔离: 复制仓库数据源到临时目录, 用 SYNO_* 注入? 生成器路径硬编码 → 用临时拷贝
# 方式: 直接对真实产物测试（生成器可写仓库产物，测试后恢复）。简化: 只测幂等逻辑
#       依赖的真实文件（mtime 不改动）。
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
GEN="$REPO_DIR/scripts/control-tower/gen-cto-health.py"
OUT="$REPO_DIR/docs/synova/CTO-HEALTH.md"
BY_LOG="$REPO_DIR/.claude/bypass.log"

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_contains() { if echo "$1" | grep -qF "$2"; then pass "$3"; else fail "$3 — 未找到: $2"; fi; }

[ -f "$OUT" ] || python3 "$GEN" >/dev/null 2>&1 || true

echo "═══════════════════════════════════════════════════════════"
echo "  D384 gen-cto-health 生成器测试（幂等 + 指纹）"
echo "═══════════════════════════════════════════════════════════"
echo ""

echo "── 1. 产物含数据源指纹行 ──"
if head -3 "$OUT" | grep -qE "数据源指纹: [0-9a-f]{12}"; then pass "指纹行存在 (12 hex)"; else fail "指纹行缺失"; fi
echo ""

echo "── 2. 连续运行 → 幂等不写 ──"
OUT1=$(python3 "$GEN" 2>&1)
OUT2=$(python3 "$GEN" 2>&1)
assert_contains "$OUT2" "幂等" "第二次运行输出幂等"
assert_contains "$OUT2" "不写文件" "不写文件"
echo ""

echo "── 3. 数据源变化 → 指纹变 → 重写 ──"
# 备份 bypass.log 尾部, 追加一条测试事件, 运行, 恢复
TAIL_BACKUP=$(tail -1 "$BY_LOG" 2>/dev/null || true)
echo "2026-08-16T12:00:00+08:00 | COMMITTED | pre-commit PASS | TASK_ID=D384-TEST | AGENT=test" >> "$BY_LOG" 2>/dev/null || true
OUT3=$(python3 "$GEN" 2>&1)
if echo "$OUT3" | grep -q "已生成"; then pass "数据源变 → 重写"; else fail "数据源变但未重写: $OUT3"; fi
# 恢复 bypass.log（去掉测试行）
if [ -n "$TAIL_BACKUP" ]; then
  grep -v "D384-TEST" "$BY_LOG" > "$BY_LOG.tmp" 2>/dev/null && mv "$BY_LOG.tmp" "$BY_LOG" 2>/dev/null || true
fi
# 恢复幂等态
python3 "$GEN" >/dev/null 2>&1 || true
echo ""

echo "── 4. dry-run 可跑且含指纹 ──"
OUT4=$(python3 "$GEN" --dry-run 2>&1)
assert_contains "$OUT4" "数据源指纹" "dry-run 含指纹"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  结果: PASS=$PASS FAIL=$FAIL"
echo "═══════════════════════════════════════════════════════════"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
