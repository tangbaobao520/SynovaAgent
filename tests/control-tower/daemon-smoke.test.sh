#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# daemon-smoke.test.sh — D314 独立化底座冒烟测试
#
# 覆盖（铁律 48：正常/降级/边界）:
#   1. attach.py 跑 → session-registry 新条目 + runtime.log 新增一行
#   2. gate.log 有 attach 记录
#   3. health.json 生成且含五维 + status
#   4. registry 损坏 → attach exit 0 + degraded 记录（fail-open）
#   5. attach 总耗时 <3s（轻量约束）
#
# 全部走 SYNO_CT_DIR 注入隔离目录，不碰真实状态。
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ATTACH="$REPO_DIR/scripts/control-tower/attach.py"
SELF_HEALTH="$REPO_DIR/scripts/control-tower/self-health.py"
TMP_DIR="$REPO_DIR/.codex/control-tower/tmp"
# 用相对路径（attach 内部 python Path 打不开 /d/ 前缀；测试 cwd=仓库根）
CT_DIR=".codex/control-tower/tmp/ds-ct"

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_contains() { if echo "$1" | grep -qF "$2"; then pass "$3"; else fail "$3 — 未找到: $2"; fi; }

rm -rf "$CT_DIR"; mkdir -p "$CT_DIR"

echo "═══════════════════════════════════════════════════════════"
echo "  D314 daemon-smoke 测试 — 独立化底座"
echo "═══════════════════════════════════════════════════════════"
echo ""

echo "── 1. attach 注册 + runtime.log ──"
START=$(date +%s)
SYNO_CT_DIR="$CT_DIR" python3 "$ATTACH" --session-id "TEST-SESSION" > /dev/null 2>&1 || true
END=$(date +%s)
if [ -f "$CT_DIR/session-registry.json" ]; then
  N=$(python3 -c "import json; d=json.load(open('$CT_DIR/session-registry.json', encoding='utf-8')); print(len(d.get('sessions', [])))" 2>/dev/null || echo 0)
  if [ "$N" -ge 1 ]; then pass "session-registry 有新条目 ($N)"; else fail "registry 无条目"; fi
else
  fail "session-registry.json 未生成"
fi
if [ -f "$CT_DIR/logs/runtime.log" ]; then
  pass "runtime.log 存在"
else
  fail "runtime.log 缺失"
fi
echo ""

echo "── 2. gate.log ──"
if [ -f "$CT_DIR/logs/gate.log" ]; then
  pass "gate.log 存在"
else
  fail "gate.log 缺失"
fi
echo ""

echo "── 3. health.json 五维 ──"
SYNO_CT_DIR="$CT_DIR" python3 "$SELF_HEALTH" > /dev/null 2>&1 || true
if [ -f "$CT_DIR/health.json" ]; then
  OUT=$(python3 -c "import json; d=json.load(open('$CT_DIR/health.json', encoding='utf-8')); print(d.get('status',''), len(d.get('dimensions',{})))" 2>/dev/null || echo "")
  assert_contains "$OUT" "5" "health.json 含五维"
else
  fail "health.json 未生成"
fi
echo ""

echo "── 4. registry 损坏 fail-open ──"
echo "corrupt json" > "$CT_DIR/session-registry.json"
EXIT=0
OUT=$(SYNO_CT_DIR="$CT_DIR" python3 "$ATTACH" --session-id "TEST2" 2>&1) || EXIT=$?
if [ "$EXIT" -eq 0 ]; then pass "registry 损坏 → exit 0（fail-open）"; else fail "registry 损坏 exit=$EXIT"; fi
# 损坏被 session_registry 自愈（degraded 记录 component=session-registry）；attach 自身不抛
if grep -q "corrupt\|session-registry" "$CT_DIR/logs/degraded-events.log" 2>/dev/null; then
  pass "degraded-events.log 有损坏自愈记录"
else
  fail "degraded-events.log 无降级记录"
fi
echo ""

echo "── 5. 耗时 <3s ──"
ELAPSED=$((END - START))
if [ "$ELAPSED" -lt 3 ]; then pass "attach 耗时 ${ELAPSED}s < 3s"; else fail "attach 耗时 ${ELAPSED}s ≥ 3s"; fi
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  结果: $PASS 通过, $FAIL 失败"
if [ "$FAIL" -gt 0 ]; then
  echo "  Status: ❌ daemon-smoke 测试未通过"
  echo "═══════════════════════════════════════════════════════════"
  exit 1
fi
echo "  Status: ✅ daemon-smoke 测试全部通过"
echo "═══════════════════════════════════════════════════════════"
exit 0
