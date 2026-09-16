#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# check-progress-freshness.test.sh — D786 产物过期看门狗的密封测试
#
# 背景（D786 / M4+M2 族）: bot PR 永久 blocked 期间产物停更 3 天+无人发现——
#   「数字自动刷新」链断在「没人看的地方」。看门狗 = 把静默断链变成 3 天内红灯。
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   ① 正常放行  — generated_at = now → exit 0 + ✅
#   ② 过期必红  — 距 now 4 天 → exit 1 + 🚨（看门狗触发态）
#   ③ 边界      — 恰好 3.0 天 → exit 0（「超过 3 天」才告警，等于不算）
#   ④ fail-closed 缺文件   — exit 2 + degraded（查不了 ≠ 新鲜）
#   ⑤ fail-closed 坏 JSON  — exit 2 + degraded
#   ⑥ fail-closed 缺字段   — 无 generated_at → exit 2 + degraded
#   ⑦ 坏参数    — --now 不可解析 / 未知参数 → exit 2
#   ⑧ 真实仓库冒烟 — 对仓库真实产物以 --now=generated_at 跑 → exit 0（age=0）
#   接线        — watchdog workflow 真的调用本脚本 + 本测试在 ci.yml canary 清单
#                 （防「机制建成未接线」M3；D664 同型教训）
# 沙箱: mktemp 临时产物 + 固定时钟 --now（零平台 date 差异，Win/CI 确定性）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SUT="$REPO/scripts/product-lines/check-progress-freshness.py"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT

# PLATFORM-CHECKLIST #1: PYBIN 三级探测（禁裸 python3）
PYBIN=""
for _c in python3 python py; do
  if command -v "$_c" >/dev/null 2>&1 && "$_c" -c "import sys" >/dev/null 2>&1; then PYBIN="$_c"; break; fi
done
[ -n "$PYBIN" ] || { echo "❌ 无可用 python"; exit 2; }

echo "=== D786: check-progress-freshness（产物过期看门狗）==="

# ── 接线（防 M3: 建了不接线 = 纸老虎）──
grep -q 'check-progress-freshness.py' "$REPO/.github/workflows/progress-freshness-watchdog.yml" \
  && ok "接线: watchdog workflow 调用看门狗脚本" || no "接线: watchdog workflow 未调用（M3）"
grep -q 'check-progress-freshness.test.sh' "$REPO/.github/workflows/ci.yml" \
  && ok "接线: 本测试在 ci.yml canary 清单" || no "接线: 本测试不在 ci.yml canary（CI 不跑 = 摆设）"

# ── 沙箱产物构造（固定时钟 2026-09-16 12:00:00，零 date 差异）──
NOW="2026-09-16 12:00:00"
mkjson() { # $1=文件名 $2=generated_at 值（或 __NONE__ 表示缺字段）
  local f="$TMPD/$1"
  if [ "$2" = "__NONE__" ]; then
    printf '{"version":"1.0"}\n' > "$f"
  else
    printf '{"generated_at":"%s","version":"1.0"}\n' "$2" > "$f"
  fi
  echo "$f"
}
FRESH_F=$(mkjson fresh.json   "2026-09-16 09:00:00")   # 0.125 天
STALE_F=$(mkjson stale.json   "2026-09-12 12:00:00")   # 4.0 天 → 必红
BOUND_F=$(mkjson bound.json   "2026-09-13 12:00:00")   # 恰好 3.0 天 → 仍绿
BADJSON_F="$TMPD/bad.json"; printf 'not-json{{{' > "$BADJSON_F"

run_sut() { # $@ = 额外参数; 输出捕获到 OUT/RC
  OUT=$("$PYBIN" "$SUT" "$@" 2>"$TMPD/err.txt"); RC=$?
}

# ── ① 正常放行 ──
run_sut --file "$FRESH_F" --now "$NOW"
[ "$RC" -eq 0 ] && case "$OUT" in *✅*) ok "① 新鲜产物 exit 0 + ✅";; *) no "① exit 0 但无 ✅ 标记";; esac \
  || no "① 新鲜产物应 exit 0，实际 $RC: $OUT"

# ── ② 过期必红（看门狗触发态）──
run_sut --file "$STALE_F" --now "$NOW"
[ "$RC" -eq 1 ] && case "$OUT" in *🚨*) ok "② 过期产物 exit 1 + 🚨 告警";; *) no "② exit 1 但无 🚨 标记";; esac \
  || no "② 过期产物应 exit 1，实际 $RC: $OUT"

# ── ③ 边界: 恰好 3.0 天 → 仍算新鲜（「超过」才告警）──
run_sut --file "$BOUND_F" --now "$NOW"
[ "$RC" -eq 0 ] && ok "③ 边界 3.0 天 exit 0（等于阈值不告警）" || no "③ 边界 3.0 天应 exit 0，实际 $RC: $OUT"

# ── ④⑤⑥ fail-closed 三态（查不了 ≠ 新鲜，铁律 11）──
run_sut --file "$TMPD/nonexistent.json" --now "$NOW"
[ "$RC" -eq 2 ] && grep -q "degraded:" "$TMPD/err.txt" \
  && ok "④ 缺文件 exit 2 + degraded 留痕" || no "④ 缺文件应 exit 2+degraded，实际 $RC"
run_sut --file "$BADJSON_F" --now "$NOW"
[ "$RC" -eq 2 ] && grep -q "degraded:" "$TMPD/err.txt" \
  && ok "⑤ 坏 JSON exit 2 + degraded 留痕" || no "⑤ 坏 JSON 应 exit 2+degraded，实际 $RC"
NOGEN_F=$(mkjson nogen.json "__NONE__")
run_sut --file "$NOGEN_F" --now "$NOW"
[ "$RC" -eq 2 ] && grep -q "degraded:" "$TMPD/err.txt" \
  && ok "⑥ 缺 generated_at exit 2 + degraded 留痕" || no "⑥ 缺字段应 exit 2+degraded，实际 $RC"

# ── ⑦ 坏参数 ──
run_sut --file "$FRESH_F" --now "not-a-date"
[ "$RC" -eq 2 ] && ok "⑦ --now 不可解析 exit 2" || no "⑦ 坏 --now 应 exit 2，实际 $RC"
run_sut --file "$FRESH_F" --now "$NOW" --bogus-flag
[ "$RC" -eq 2 ] && ok "⑦ 未知参数 exit 2" || no "⑦ 未知参数应 exit 2，实际 $RC"

# ── ⑧ 真实仓库冒烟（真实产物 + age=0 必绿）──
# PLATFORM-CHECKLIST: 路径经 cat 由 shell 解析、Python 走 stdin——规避 Git Bash(/c/...)
# 与原生 Windows Python(C:\...) 的路径翻译差异（D786 windows canary 实证）
REAL="$REPO/docs/synova/product-lines/product-progress.json"
if [ -f "$REAL" ]; then
  REAL_GEN=$(cat "$REAL" | "$PYBIN" -c "import json,sys;print(json.load(sys.stdin)['generated_at'])" || true)
  if [ -n "${REAL_GEN:-}" ]; then
    run_sut --file "$REAL" --now "$REAL_GEN"
    [ "$RC" -eq 0 ] && ok "⑧ 真实产物 age=0 冒烟 exit 0（generated_at=${REAL_GEN}）" \
      || no "⑧ 真实产物 age=0 应 exit 0，实际 $RC: $OUT"
  else
    no "⑧ 真实产物 generated_at 不可读"
  fi
else
  echo "  ⚠ ⑧ 真实产物不存在（全新 clone 首次跑可接受）"
fi

echo ""
echo "════════════════════════════════════"
echo "  通过 $PASS / 失败 $FAIL"
[ "$FAIL" -eq 0 ] && { echo "✅ 全部通过"; exit 0; }
echo "❌ 存在失败"; exit 1
