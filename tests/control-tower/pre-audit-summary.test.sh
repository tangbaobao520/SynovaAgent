#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# pre-audit-summary.test.sh — U8 机器预审汇总测试
#
# 覆盖 (铁律 48 正常/降级/边界 + 接线):
#   1. 正常 — 输出"机器预审汇总"结构
#   2. 边界 — --json 输出合法 JSON + verdict ∈ {pass,fail,degraded} + 5 门禁
#   3. 边界 — 退出码 ∈ {0,1,2}（三态, 不混同）
#   4. 边界 — risk 字段读取: temp D999.json risk=high → 建议"高风险...全量"
#   5. 接线 — 聚合的 U1-U4/U7 门禁名真实存在（铁律 0-2）
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TOOL="$REPO/scripts/control-tower/pre-audit-summary.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "=== U8 pre-audit-summary 测试 ==="

# ── 接线: 聚合门禁名真实存在 ──
if grep -q "U1-bypass-reconcile" "$TOOL" && grep -q "U2-writeset-reconcile" "$TOOL" \
   && grep -q "U3-artifact-repro" "$TOOL" && grep -q "U4-claims-table" "$TOOL" \
   && grep -q "U7-ct-test-gate" "$TOOL"; then
  ok "接线: 聚合 U1-U4/U7 五门禁"
else
  no "接线: 门禁清单缺失"
fi

# ── 正常: 输出结构 ──
OUT=$(bash "$TOOL" 2>&1)
rc=$?
if echo "$OUT" | grep -q "机器预审汇总"; then
  ok "正常: 输出机器预审汇总结构"
else
  no "正常: 输出结构异常"
fi

# ── 边界: 退出码 ∈ {0,1,2} 三态 ──
case "$rc" in
  0|1|2) ok "边界: 三态退出码 (exit=$rc)" ;;
  *) no "边界: 退出码非法 (exit=$rc)" ;;
esac

# ── 边界: --json 合法 JSON + verdict + 5 门禁 ──
JSON=$(bash "$TOOL" --json 2>&1)
if echo "$JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['component']=='pre-audit-summary'; assert d['verdict'] in ('pass','fail','degraded'); assert len(d['gates'])==5; print('OK')" 2>/dev/null; then  # swallow-ok: JSON 断言失败由 if 判定 exit code
  ok "边界: --json 合法 + verdict 三态 + 5 门禁"
else
  no "边界: --json 解析失败"
fi

# ── 边界: risk 字段读取 ──
echo '{"task_id":"D999","title":"测试","status":"claimed","risk":"high"}' > "$REPO/task-state/D999.json"
RISKOUT=$(bash "$TOOL" --task-id D999 2>&1)
rm -f "$REPO/task-state/D999.json"
if echo "$RISKOUT" | grep -q "risk=high" && echo "$RISKOUT" | grep -q "高风险"; then
  ok "边界: risk=high → 建议高风险全量"
else
  no "边界: risk 字段读取失败"
fi

# ── 回归 (K3 终审 D426 FAIL 修复): 不得引用不存在的 reconcile-bypass-log.sh ──
if grep -q "reconcile-bypass-log.sh" "$TOOL"; then
  no "回归: 仍引用不存在的 reconcile-bypass-log.sh（死引用，K3 判交付即死）"
else
  ok "回归: 已去除 reconcile-bypass-log.sh 死引用"
fi
if grep -q "check-bypass-log.sh" "$TOOL"; then
  ok "回归: 引用实际存在的 check-bypass-log.sh（U1 落地脚本）"
else
  no "回归: 未引用 check-bypass-log.sh"
fi

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
