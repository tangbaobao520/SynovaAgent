#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# pre-audit-summary.sh — U8 工程侧: 机器预审汇总（三层审计模型 第0层）
#
# 背景 (U8, K3 降本前提): K3 成本高的根因 = 把机器 1 秒能查的物理项
#   （接口存在/路径存在/证据对账/测试覆盖/写集一致）交给零上下文语义大脑逐份重查。
#   本脚本把 U1-U4/U7 已落地的物理门禁聚合成一次"机器预审"，
#   输出"预审是否已过"——没过直接打回，不浪费 K3 语义大脑。
#
# 红线 (U8 红线声明): 只做工程侧机器预审，不碰 scripts/audit/、不编写/修改审计判定口径。
#   风险分级表是"建议"（采纳权在创始人 + K3），本脚本只读取并展示，不裁决。
#
# 聚合的机器可查项（对应 UPGRADE-SPEC U1-U4/U7）:
#   U1 bypass 证据链对账  → reconcile-bypass-log.sh（存量 check-bypass-log.sh 有 SSH hang bug，不回退）
#   U2 dev doc 写集对账   → check-dev-doc-write-set.sh
#   U3 生成器产物可复现   → gen-cto-health.py --strict
#   U4 声称↔证据自证表    → verify-claims-table.sh
#   U7 控制塔测试门禁     → ct-test-gate.sh
#   (tsc/vitest 由 CI + pre-push 负责, 不在此重复跑——它们非"1 秒级"机器可查项)
#
# 用法: pre-audit-summary.sh [--task-id <D#>] [--json]
# 退出码: 0 = 机器预审全过(可进 K3 语义终审); 1 = 有机器可查项未过(打回);
#         2 = 检查降级/门禁未落地(不完整, 显式降级不静默当真)
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

JSON_OUT="no"
TASK_ID=""
for arg in "$@"; do
  case "$arg" in
    --json) JSON_OUT="yes" ;;
    --task-id) TASK_ID="${2:-}"; shift 2 ;;
    *) : ;;
  esac
done

# ── 门禁清单: name | script(相对 REPO) | args | 描述 ──
GATES=(
  # 注: U1 不回退存量 check-bypass-log.sh（它有 git fetch SSH hang 的 fail-open bug，正是 U1 要修的）
  "U1-bypass-reconcile|scripts/control-tower/reconcile-bypass-log.sh||绕过证据链对账"
  "U2-writeset-reconcile|scripts/workflow/check-dev-doc-write-set.sh||dev doc 写集双向对账"
  "U3-artifact-repro|scripts/control-tower/gen-cto-health.py|--strict|生成器产物可复现"
  "U4-claims-table|scripts/control-tower/verify-claims-table.sh||声称↔证据自证表"
  "U7-ct-test-gate|scripts/control-tower/ct-test-gate.sh||控制塔脚本测试门禁"
)

risk_of() {
  local tid="$1"
  [ -z "$tid" ] && { echo "?"; return; }
  local f="$REPO_DIR/task-state/${tid}.json"
  [ -f "$f" ] || { echo "?"; return; }
  python3 -c "import json,sys; d=json.load(open('$f')); print(d.get('risk','medium'))" 2>/dev/null || echo "?"
}

# ── 运行单个门禁: 返回 0 pass / 1 fail / 2 degraded / 3 未落地 ──
# D334 cross-platform: Mac 无 GNU timeout → 用 Python subprocess.timeout 兜底(20s),
# 且 .py 用 python3、.sh 用 bash 执行。
run_gate() {
  local script="$1"; shift
  local full="$REPO_DIR/$script"
  if [ ! -f "$full" ]; then
    return 3
  fi
  local runner="bash"
  case "$full" in
    *.py) runner="python3" ;;
  esac
  python3 - "$runner" "$full" "$@" >/dev/null 2>&1 <<'PYEOF'
import subprocess, sys
try:
    cmd = [sys.argv[1], sys.argv[2]] + list(sys.argv[3:])
    r = subprocess.run(cmd, capture_output=True, timeout=20)
    sys.exit(0 if r.returncode == 0 else (1 if r.returncode == 1 else 2))
except subprocess.TimeoutExpired:
    sys.exit(2)
except Exception:
    sys.exit(2)
PYEOF
  return $?
}

declare -a RESULTS
PASS_N=0; FAIL_N=0; DEGRADED_N=0; MISSING_N=0

for gate in "${GATES[@]}"; do
  IFS='|' read -r gname gscript gargs gdesc <<< "$gate"
  run_gate "$gscript" $gargs
  code=$?
  case "$code" in
    0) PASS_N=$((PASS_N+1)); RESULTS+=("$gname|pass|$gdesc") ;;
    1) FAIL_N=$((FAIL_N+1)); RESULTS+=("$gname|fail|$gdesc") ;;
    2) DEGRADED_N=$((DEGRADED_N+1)); RESULTS+=("$gname|degraded|$gdesc") ;;
    3) MISSING_N=$((MISSING_N+1)); RESULTS+=("$gname|missing|$gdesc (门禁未落地, 分支未合并)") ;;
  esac
done

RISK="?"
if [ -n "$TASK_ID" ]; then
  RISK=$(risk_of "$TASK_ID")
fi
case "$RISK" in
  low) SUGGEST="低风险 → 机器预审 + K3 抽查" ;;
  high) SUGGEST="高风险 → 机器预审 + K3 全量" ;;
  medium) SUGGEST="中风险 → 机器预审 + K3 抽查(偏全量)" ;;
  *) SUGGEST="未标风险 → 默认按 medium（建议派活时由 CTO/创始人标 risk）" ;;
esac

if [ "$JSON_OUT" = "yes" ]; then
  python3 - "$PASS_N" "$FAIL_N" "$DEGRADED_N" "$MISSING_N" "$RISK" "$SUGGEST" "${RESULTS[@]}" <<'PYEOF'
import json, sys
pass_n, fail_n, degraded_n, missing_n = map(int, sys.argv[1:5])
risk, suggest = sys.argv[5], sys.argv[6]
results = []
for r in sys.argv[7:]:
    name, code, desc = r.split("|", 2)
    results.append({"gate": name, "status": code, "desc": desc})
verdict = "fail" if fail_n > 0 else ("degraded" if (degraded_n + missing_n) > 0 else "pass")
print(json.dumps({"component": "pre-audit-summary", "verdict": verdict,
                  "pass": pass_n, "fail": fail_n, "degraded": degraded_n, "missing": missing_n,
                  "risk": risk, "suggested_audit": suggest, "gates": results}, ensure_ascii=False))
PYEOF
  exit 0
fi

echo "── 机器预审汇总（U8 第0层, K3 语义终审前物理预检）──"
echo ""
for r in "${RESULTS[@]}"; do
  IFS='|' read -r gname gcode gdesc <<< "$r"
  case "$gcode" in
    pass) echo "  ✅ $gname: $gdesc" ;;
    fail) echo "  ❌ $gname: $gdesc" ;;
    degraded) echo "  ⚠️  $gname: $gdesc (降级)" ;;
    missing) echo "  ⏳ $gname: $gdesc" ;;
  esac
done
echo ""
if [ -n "$TASK_ID" ]; then
  echo "风险分级: $TASK_ID → risk=$RISK"
  echo "建议审计深度: $SUGGEST"
  echo ""
fi

if [ "$FAIL_N" -gt 0 ]; then
  echo "❌ 机器预审未过: $FAIL_N 项未过 — 打回，不浪费 K3 语义大脑"
  exit 1
elif [ "$((DEGRADED_N + MISSING_N))" -gt 0 ]; then
  echo "⚠️  机器预审不完整: $DEGRADED_N 项降级 + $MISSING_N 项门禁未落地 — 需先合并 U1/U4/U7 或人工确认"
  exit 2
fi
echo "✅ 机器预审全过 ($PASS_N 项) — 可进 K3 语义终审"
exit 0
