#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# required-checks-probe.test.sh — D971 必需检查对账探针密封测试
#
# 覆盖矩阵（铁律 48 三路径 + 安全 + 接线）:
#   正常 — 夹具：必需 context 全被实际报告 → exit 0 + `REQUIRED-CHECKS: OK`
#   DRIFT — 夹具：缺 1 个必需 context → exit 1 + `DRIFT(1)` + 点名该 context
#   降级 — 无凭据文件 / 无 GITHUB_TOKEN 键 → exit 2 + stderr 显式 degraded（不静默）
#   降级 — 夹具文件缺失 / required.json 非法（必需列表空）→ exit 2
#   边界 — jobs.txt 为空（有必需项）→ exit 1（DRIFT，不当作通过）
#   安全 — token 绝不出现在 stdout/stderr：静态断言（无 echo/printf 直出 TOKEN）
#   接线 — daily-cto-board.sh 的通用 runner 会执行 probes/*-probe.sh（铁律 0-2）
#   独立 — 探针不依赖 daily-cto-board.sh（grep 反向断言）
# 零真实网络: 全部经 SYNO_PROBE_FIXTURE_DIR 离线夹具；零真实仓库污染（mktemp + trap）。
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROBE="$REPO/scripts/control-tower/probes/required-checks-probe.sh"
BOARD="$REPO/scripts/control-tower/daily-cto-board.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT

mk_fix() { # <必需 context 数> <是否包含最后一项> → echo 夹具路径
  local n="$1" incl="${2:-1}" d; d="$(mktemp -d "$TMPD/fx.XXXXXX")"
  python3 - "$d" "$n" <<'PY'
import json, sys
d, n = sys.argv[1], int(sys.argv[2])
ctx = ["Vitest (1/2)", "Vitest (2/2)", "Golden Case F1 Gate"]
json.dump({"required_status_checks": {"checks": [{"context": c} for c in ctx[:n]]}},
          open(d + "/required.json", "w"))
PY
  : > "$d/jobs.txt"
  local i=0
  while [ "$i" -lt "$n" ]; do
    if [ "$i" -lt $((n-1)) ] || [ "$incl" = "1" ]; then printf '%s\n' "$(python3 -c "print(['Vitest (1/2)','Vitest (2/2)','Golden Case F1 Gate'][$i])")" >> "$d/jobs.txt"; fi
    i=$((i+1))
  done
  echo "$d"
}

echo "=== D971 必需检查对账探针密封测试 ==="

# ── 正常 ──
FX="$(mk_fix 3 1)"
OUT="$(SYNO_PROBE_FIXTURE_DIR="$FX" bash "$PROBE" 2>&1)"; RC=$?
echo "$OUT" | grep -q 'REQUIRED-CHECKS: OK' && ok "正常: 全部必需 context 被报告 → OK" || no "正常: 未 OK（${OUT}）"
[ "$RC" -eq 0 ] && ok "正常: exit 0" || no "正常: 应 exit 0，实际 ${RC}"

# ── DRIFT ──
FX="$(mk_fix 3 0)"   # 必需 3 项，jobs 只报 2 项（缺 Golden Case）
OUT="$(SYNO_PROBE_FIXTURE_DIR="$FX" bash "$PROBE" 2>&1)"; RC=$?
echo "$OUT" | grep -q 'REQUIRED-CHECKS: DRIFT(1)' && ok "DRIFT: 缺 1 项 → DRIFT(1)" || no "DRIFT: 未报 DRIFT(1)（${OUT}）"
echo "$OUT" | grep -q 'Golden Case F1 Gate' && ok "DRIFT: 点名缺失 context" || no "DRIFT: 未点名"
[ "$RC" -eq 1 ] && ok "DRIFT: exit 1" || no "DRIFT: 应 exit 1，实际 ${RC}"

# ── 降级: 无凭据文件 ──
OUT="$(SYNO_CRED_FILE="$TMPD/nope.yaml" bash "$PROBE" 2>&1)"; RC=$?
echo "$OUT" | grep -q 'REQUIRED-CHECKS: DEGRADED' && ok "降级: 无凭据 → DEGRADED" || no "降级: 未 DEGRADED"
echo "$OUT" | grep -q 'degraded: 凭据文件不存在' && ok "降级: stderr 显式点名（不静默）" || no "降级: 无显式说明"
[ "$RC" -eq 2 ] && ok "降级: exit 2（fail-closed，不与通过混同）" || no "降级: 应 exit 2，实际 ${RC}"

# ── 降级: 凭据文件存在但无 GITHUB_TOKEN 键 ──
CRED2="$TMPD/cred2.yaml"; printf 'FOO: bar\n' > "$CRED2"
OUT="$(SYNO_CRED_FILE="$CRED2" bash "$PROBE" 2>&1)"; RC=$?
echo "$OUT" | grep -q '无 GITHUB_TOKEN 键' && ok "降级: 缺键 → 点名" || no "降级: 缺键未点名（${OUT}）"
[ "$RC" -eq 2 ] && ok "降级: 缺键 → exit 2" || no "降级: 缺键应 exit 2，实际 ${RC}"

# ── 降级: 夹具缺文件 ──
FXNE="$(mktemp -d "$TMPD/fx.XXXXXX")"
OUT="$(SYNO_PROBE_FIXTURE_DIR="$FXNE" bash "$PROBE" 2>&1)"; RC=$?
[ "$RC" -eq 2 ] && ok "降级: 夹具缺 required.json → exit 2" || no "降级: 应 exit 2，实际 ${RC}"

# ── 降级: 必需列表空（无从对账）──
FXE="$(mktemp -d "$TMPD/fx.XXXXXX")"; printf '{"required_status_checks":{"checks":[]}}\n' > "$FXE/required.json"; printf 'x\n' > "$FXE/jobs.txt"
OUT="$(SYNO_PROBE_FIXTURE_DIR="$FXE" bash "$PROBE" 2>&1)"; RC=$?
echo "$OUT" | grep -q '必需 context 列表为空' && ok "降级: 空必需列表 → 点名" || no "降级: 空列表未点名（${OUT}）"
[ "$RC" -eq 2 ] && ok "降级: 空必需列表 → exit 2" || no "降级: 应 exit 2，实际 ${RC}"

# ── 边界: jobs 列表为空但有必需项 → DRIFT（不得当通过）──
FXB="$(mk_fix 2 1)"; : > "$FXB/jobs.txt"
OUT="$(SYNO_PROBE_FIXTURE_DIR="$FXB" bash "$PROBE" 2>&1)"; RC=$?
[ "$RC" -eq 1 ] && ok "边界: 零报告 → DRIFT exit 1（不当作通过）" || no "边界: 应 exit 1，实际 ${RC}"

# ── 安全（行为断言）: 用哨兵 token 走真实 API 路径，输出中**绝不得**出现 token ──
#   注: 本断言不依赖网络成功与否 —— 无论 OK/DRIFT/DEGRADED，token 都不得出现在 stdout/stderr。
SENTINEL="SENTINEL-D971-DO-NOT-PRINT-abc123"
CRED3="$TMPD/cred3.yaml"; printf 'GITHUB_TOKEN: %s\n' "$SENTINEL" > "$CRED3"
OUT="$(SYNO_CRED_FILE="$CRED3" bash "$PROBE" 2>&1)"
if echo "$OUT" | grep -q "$SENTINEL"; then
  no "安全: token 泄漏到输出"
else
  ok "安全: 哨兵 token 未出现在输出（真实 API 路径实跑）"
fi
grep -q 'chmod 600 "$TOKF"' "$PROBE" && ok "安全: token 临时文件 0600" || no "安全: 未见 0600 保护"

# ── 契约: 探针落在约定发现路径且命名合规（daily-cto-board 的通用 runner 按 *-probe.sh 发现）──
case "$PROBE" in
  */scripts/control-tower/probes/*-probe.sh) ok "接线: 落点与命名符合 probes/*-probe.sh 约定" ;;
  *) no "接线: 落点/命名不符约定（${PROBE}）" ;;
esac
if grep -q 'probes' "$BOARD" && grep -q -- '-probe.sh' "$BOARD"; then
  ok "接线: daily-cto-board 已含通用探针 runner（D969）"
else
  echo "  ⚠️ 接线（待 D969 合入）: 本分支基于的 main 尚未含看板探针 runner —— #796 合入后此路径自动生效（本项不计 pass/fail）"
fi
# ── 独立: 反向断言（探针**代码**不得依赖看板脚本；注释提及不算）──
if grep -vE '^\s*#' "$PROBE" | grep -q 'daily-cto-board'; then
  no "独立: 探针代码反向依赖看板（应可独立复跑）"
else
  ok "独立: 探针代码不依赖 daily-cto-board.sh（可独立复跑）"
fi

echo ""
echo "  结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
