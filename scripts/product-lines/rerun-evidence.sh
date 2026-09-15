#!/usr/bin/env bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# rerun-evidence.sh — D774 证据保鲜流水线（一键重跑 + 兑换 + 前后对照）
#
# 一句话: 定期重跑全部可机器验证的验收项（GS 场景 + 线1 vitest + A2 套件），
#         写新证据 → 自动 refresh-all → 打印刷新前后六态对照（stale↓ / pending_k3↑）。
#         证据 TTL 14 天（calc-progress.py:67）+ modules 变更即失效（:33）——
#         不重跑，任何验收成果 14 天后归零。本脚本是"保鲜"，不是"改判分"。
#
# 契约（铁律 47）:
#   @input  — 无参必选；可选 --skip-gs / --skip-vitest / --no-refresh（调试与测试）
#             环境注入缝（测试沙箱专用，SYNO_RERUN_ 前缀; 全量覆盖 → 零真实仓库写入）:
#               SYNO_RERUN_GS_DIR          GS 场景根目录（默认 <repo>/scripts/golden-scenarios）
#               SYNO_RERUN_EVIDENCE_DIR    产品证据目录（默认 docs/synova/product-lines/evidence）
#               SYNO_RERUN_SUMMARY_DIR     汇总输出目录（默认 docs/synova/product-lines）
#               SYNO_RERUN_PROGRESS_JSON   进度 JSON（默认 docs/synova/product-lines/product-progress.json）
#               SYNO_RERUN_VITEST_CMD      vitest 命令（默认 node_modules/.bin/vitest run tests/electron/）
#               SYNO_RERUN_A2_CMD          A2 命令（默认 bash run-machine-evidence.sh）
#               SYNO_RERUN_REFRESH_CMD     刷新命令（默认 bash refresh-all.sh）
#               SYNO_RERUN_TODAY           日期覆盖 YYYY-MM-DD（默认 PYBIN 实算，规避 date 平台差异）
#   @output — ① GS 场景证据: <GS_DIR>/evidence/GS-XX-<date>.json（场景 assert.ts 写，同日覆盖=幂等）
#             ② 线1 vitest 证据: <EVIDENCE_DIR>/test-<date>*.json（evidence-writer.py，同日同源去重）
#             ③ 汇总: <SUMMARY_DIR>/rerun-evidence-summary-<date>.json（fresh/fail/skip/degraded 逐项）
#             ④ 终端打印刷新前后六态计数对照表
#   @exit   — 0 = 全部可跑项 fresh（skip 不算失败）
#             1 = 存在显式 fail（反向验证: 故意失败 → 汇总点名 + 非零退出，绝不静默吞）
#             2 = 无 fail 但存在降级（vitest 不可用 / refresh 失败——检查链受损，D328 三态）
#   @degraded — 环境缺失（vitest/A2 不可执行）→ 逐项登记进汇总 + 不写 pass 证据
#               （fail-closed 铁律 11: 查不了 ≠ 通过，绝不写失真证据）
#   @error  — 不抛; 全部经退出码 + 汇总 JSON 表达
#
# 幂等（验收硬要求）:
#   - GS 证据同日同名覆盖（assert.ts 契约）; 线1 证据写入前查同日同 type+verdict+points+source
#     已存在 → 跳过（连跑两次零新增文件、结论一致）
#   - A2（run-machine-evidence.sh）自 D774 起内置同日去重 + SYNO_A2_SKIP_WRITE 逃生说明
#
# 红线: 不写 k3 / founder_demo 类证据（审计点=K3 专属，自我审计禁止）;
#       不改 calc-progress.py 判分规则（保鲜 ≠ 改判分）。
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# PLATFORM-CHECKLIST #1: PYBIN 三级探测（禁裸 python3）
PYBIN=""
for _c in python3 python py; do  # PYBIN 三级探测（PLATFORM-CHECKLIST #1）
  if command -v "$_c" >/dev/null 2>&1 && "$_c" -c "import sys" >/dev/null 2>&1; then PYBIN="$_c"; break; fi
done
if [ -z "$PYBIN" ]; then
  echo "degraded: 找不到可用的 python（rerun-evidence 无法运行）" >&2
  exit 2
fi

# ── 注入缝（默认值 = 生产路径; 测试全量覆盖 → 零真实仓库写入）──
GS_DIR="${SYNO_RERUN_GS_DIR:-$REPO_ROOT/scripts/golden-scenarios}"
EVIDENCE_DIR="${SYNO_RERUN_EVIDENCE_DIR:-$REPO_ROOT/docs/synova/product-lines/evidence}"
SUMMARY_DIR="${SYNO_RERUN_SUMMARY_DIR:-$REPO_ROOT/docs/synova/product-lines}"
PROGRESS_JSON="${SYNO_RERUN_PROGRESS_JSON:-$REPO_ROOT/docs/synova/product-lines/product-progress.json}"
VITEST_CMD="${SYNO_RERUN_VITEST_CMD:-$REPO_ROOT/node_modules/.bin/vitest run tests/electron/}"
A2_CMD="${SYNO_RERUN_A2_CMD:-bash $SCRIPT_DIR/run-machine-evidence.sh}"
REFRESH_CMD="${SYNO_RERUN_REFRESH_CMD:-bash $SCRIPT_DIR/refresh-all.sh}"
TODAY="${SYNO_RERUN_TODAY:-$($PYBIN -c 'import datetime;print(datetime.date.today().isoformat())')}"

SKIP_GS=0; SKIP_VITEST=0; NO_REFRESH=0
for arg in "$@"; do
  case "$arg" in
    --skip-gs) SKIP_GS=1 ;;
    --skip-vitest) SKIP_VITEST=1 ;;
    --no-refresh) NO_REFRESH=1 ;;
    *) echo "未知参数: ${arg}（可用: --skip-gs --skip-vitest --no-refresh）" >&2; exit 2 ;;
  esac
done

# 子进程（GS run.sh / 测试 fake 场景）可见的产物定位缝
export SYNO_RERUN_GS_EVIDENCE_DIR="$GS_DIR/evidence"
export SYNO_RERUN_TODAY="$TODAY"

GEN_AT="$($PYBIN -c 'import datetime;print(datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))')"
SUMMARY_FILE="$SUMMARY_DIR/rerun-evidence-summary-$TODAY.json"
LOG_DIR="${SYNO_RERUN_LOG_DIR:-$($PYBIN -c 'import tempfile,os;print(os.path.join(tempfile.gettempdir(),"d774-rerun"))')}"
mkdir -p "$LOG_DIR"

ITEMS_JSON='[]'   # 汇总条目（JSON 数组，逐项 append）
N_FRESH=0; N_FAIL=0; N_SKIP=0; N_DEGRADED=0

# ── 汇总登记助手（verdict: fresh|fail|skip|degraded）──
record_item() {  # $1=id $2=verdict $3=exit_code $4=note
  local id="$1" verdict="$2" code="$3" note="$4"
  case "$verdict" in
    fresh) N_FRESH=$((N_FRESH+1)) ;;
    fail)  N_FAIL=$((N_FAIL+1)) ;;
    skip)  N_SKIP=$((N_SKIP+1)) ;;
    degraded) N_DEGRADED=$((N_DEGRADED+1)) ;;
  esac
  ITEMS_JSON="$($PYBIN - "$ITEMS_JSON" "$id" "$verdict" "$code" "$note" <<'PYEOF'
import json, sys
arr = json.loads(sys.argv[1])
arr.append({"id": sys.argv[2], "verdict": sys.argv[3],
            "exit_code": int(sys.argv[4]) if sys.argv[4].lstrip("-").isdigit() else None,
            "note": sys.argv[5]})
print(json.dumps(arr, ensure_ascii=False))
PYEOF
)" || { echo "degraded: 汇总登记失败（${id}）" >&2; exit 2; }
}

# ── 六态计数读取（product-progress.json → 单行或 absent）──
six_states() {  # $1=progress json 路径 → stdout "uncommitted=N failed=N ..." 或 "absent"
  "$PYBIN" - "$1" <<'PYEOF'
import json, sys
try:
    d = json.load(open(sys.argv[1], encoding="utf-8"))
except (OSError, ValueError):
    print("absent"); raise SystemExit
agg = {}
for l in d.get("lines", []):
    for s, c in l.get("status_counts", {}).items():
        agg[s] = agg.get(s, 0) + c
print(" ".join("%s=%d" % (s, agg.get(s, 0)) for s in
      ("uncommitted", "failed", "pending_k3", "verified", "rejected", "stale")))
PYEOF
}

# ── 同日同源证据去重检查（幂等核心）──
evidence_exists_today() {  # $1=type $2=verdict $3=points $4=source → exit 0=已存在
  "$PYBIN" - "$EVIDENCE_DIR" "$TODAY" "$1" "$2" "$3" "$4" <<'PYEOF'
import json, sys, glob, os
edir, today, rtype, verdict, points, source = sys.argv[1:7]
want = [p.strip() for p in points.split(",") if p.strip()]
for f in glob.glob(os.path.join(edir, "%s-%s*.json" % (rtype, today))):
    try:
        rec = json.load(open(f, encoding="utf-8"))
    except (OSError, ValueError):
        continue
    if rec.get("record_type") != rtype or rec.get("date") != today:
        continue
    if rec.get("verdicts", [{}])[0].get("verdict") != verdict:
        continue
    pts = [v.get("acceptance_point") for v in rec.get("verdicts", [])]
    if sorted(pts) == sorted(want) and source in str(rec.get("source", "")):
        print(f); raise SystemExit(0)
raise SystemExit(1)
PYEOF
}

echo "══ D774 证据保鲜流水线 ═══════════════════════════════════"
echo "日期: $TODAY | 证据目录: $EVIDENCE_DIR | 汇总: $SUMMARY_FILE"

# ── 0. 刷新前六态快照 ──
BEFORE="$(six_states "$PROGRESS_JSON")"
echo "── 刷新前六态: $BEFORE"

# ── 1. GS 场景逐项重跑（单项失败不中断全局）──
if [ "$SKIP_GS" = "1" ]; then
  record_item "gs-batch" "skip" 0 "--skip-gs 指定跳过"
  echo "── GS 场景: --skip-gs 跳过"
else
  # PLATFORM-CHECKLIST #8: macOS 无 GNU timeout → 探测 gtimeout; 无则直接执行（场景自含 120s 内控）
  TIMEOUT_BIN=""
  for _t in timeout gtimeout; do
    if command -v "$_t" >/dev/null 2>&1; then TIMEOUT_BIN="$_t"; break; fi
  done
  echo "── GS 场景批量重跑（$GS_DIR/GS-*/run.sh）───────────"
  for gs_run in "$GS_DIR"/GS-*/run.sh; do
    [ -e "$gs_run" ] || continue
    gs_dir="$(cd "$(dirname "$gs_run")" && pwd)"
    gs_id="$(basename "$gs_dir" | cut -d- -f1-2)"
    gs_log="$LOG_DIR/$gs_id-$TODAY.log"
    echo "  ▶ $gs_id ..."
    if [ -n "$TIMEOUT_BIN" ]; then
      "$TIMEOUT_BIN" 900 bash "$gs_run" >"$gs_log" 2>&1
    else
      echo "    (无 timeout/gtimeout — 直接执行，场景自含超时控制)" >&2
      bash "$gs_run" >"$gs_log" 2>&1
    fi
    gs_rc=$?
    gs_has_ev="no"
    [ -f "$SYNO_RERUN_GS_EVIDENCE_DIR/$gs_id-$TODAY.json" ] && gs_has_ev="yes"
    if [ "$gs_rc" -eq 0 ] && [ "$gs_has_ev" = "yes" ]; then
      record_item "$gs_id" "fresh" "$gs_rc" "exit=0; 证据=$gs_id-$TODAY.json"
      echo "    ✓ fresh（证据已落盘）"
    elif [ "$gs_rc" -eq 0 ]; then
      # fail-closed: exit 0 但无当日证据文件 = 证据链断裂（场景崩溃在断言前/假绿形态）
      # ——「没法核验」≠「通过」，判 degraded 显式留痕（铁律 11; GS-05 D370 实证形态）
      record_item "$gs_id" "degraded" "$gs_rc" "exit=0 但无当日产物文件（证据链断裂，fail-closed 不计 fresh）"
      echo "    ⚠ degraded（exit 0 但无产物——证据链断裂）" >&2
    else
      tail -3 "$gs_log" 2>/dev/null | sed 's/^/      log│ /' || true
      record_item "$gs_id" "fail" "$gs_rc" "exit=$gs_rc; 证据=$gs_has_ev; 日志: $gs_log"
      echo "    ✗ fail（exit=${gs_rc}）"
    fi
  done
fi

# ── 2. 线1 vitest 机器可验项（点映射 = D589 先例: tests/electron/ 全套件）──
LINE1_POINTS="1-1,1-3,1-4,1-5,1-6,1-7"
# 不可机器重跑点（显式登记，诚实 skip）:
#   1-2 = Windows 真机安装实测（founder-demo 面）; 1-8 = K3 审计员复核点（自我审计禁止）
record_item "1-2" "skip" 0 "Windows 真机安装实测（founder-demo 面，机器不可代验）"
record_item "1-8" "skip" 0 "K3 审计员复核点（红线: 禁止自我审计）"

if [ "$SKIP_VITEST" = "1" ]; then
  record_item "line1-vitest" "skip" 0 "--skip-vitest 指定跳过"
  echo "── 线1 vitest: --skip-vitest 跳过"
else
  echo "── 线1 vitest: tests/electron/ 全套件（点 ${LINE1_POINTS}）───────────"
  vt_log="$LOG_DIR/vitest-$TODAY.log"
  # 环境预检: 命令首词可执行性（不可用 → degraded 不写证据，fail-closed 铁律 11）
  vt_bin="${VITEST_CMD%% *}"
  if ! command -v "$vt_bin" >/dev/null 2>&1 && [ ! -x "$vt_bin" ]; then
    record_item "line1-vitest" "degraded" 127 "vitest 命令不可用（${vt_bin}）— 不写证据（fail-closed）"
    echo "  ⚠ degraded（vitest 不可用 — 不写证据）" >&2
  else
  eval "$VITEST_CMD" > "$vt_log" 2>&1
  vt_rc=$?
  if [ ! -s "$vt_log" ] && [ "$vt_rc" -ne 0 ]; then
    # 双保险: 无任何输出且非零（命令存在但静默崩溃）→ degraded, 不写证据
    record_item "line1-vitest" "degraded" "$vt_rc" "vitest 无输出异常退出（${VITEST_CMD}）— 不写证据（fail-closed）"
    echo "  ⚠ degraded（vitest 异常 — 不写证据）" >&2
  else
    vt_verdict="pass"; vt_quote="tests/electron/ 全套件绿"
    if [ "$vt_rc" -ne 0 ]; then
      vt_verdict="fail"; vt_quote="tests/electron/ 套件有失败（exit=$vt_rc; 日志 ${vt_log}）"
    fi
    if evidence_exists_today "test" "$vt_verdict" "$LINE1_POINTS" "rerun-evidence.sh (D774)"; then
      record_item "line1-vitest" "$([ "$vt_verdict" = pass ] && echo fresh || echo fail)" "$vt_rc" \
        "dedupe: 同日同源证据已存在，跳过写入; $vt_quote"
      echo "  ✓ dedupe（当日证据已入库，零新增文件）"
    else
      "$PYBIN" "$SCRIPT_DIR/evidence-writer.py" \
        --type test --date "$TODAY" --verdict "$vt_verdict" \
        --points "$LINE1_POINTS" \
        --source "rerun-evidence.sh (D774)" \
        --quote "$vt_quote" \
        --out-dir "$EVIDENCE_DIR" >"$LOG_DIR/ev-writer-$TODAY.log" 2>&1
      ew_rc=$?
      if [ "$ew_rc" -eq 0 ]; then
        if [ "$vt_verdict" = "pass" ]; then
          record_item "line1-vitest" "fresh" "$vt_rc" "$vt_quote"
          echo "  ✓ fresh（test 证据已入库）"
        else
          record_item "line1-vitest" "fail" "$vt_rc" "$vt_quote"
          echo "  ✗ fail（fail 证据已如实入库）"
          tail -5 "$vt_log" 2>/dev/null | sed 's/^/      log│ /' || true
        fi
      else
        record_item "line1-vitest" "degraded" "$ew_rc" "证据写入失败 exit=${ew_rc}（fail-closed: 写不进≠成功）"
        echo "  ⚠ degraded（证据写入失败）" >&2
      fi
    fi
  fi
  fi
fi

# ── 3. A2 其他 test 绑定套件（cron-scheduler / 会话线程等; D774 起自带同日去重）──
echo "── A2 套件（test: 绑定项）───────────"
a2_log="$LOG_DIR/a2-$TODAY.log"
eval "$A2_CMD" > "$a2_log" 2>&1
a2_rc=$?
a2_verdict="$(grep -o 'verdict=[a-z]*' "$a2_log" | tail -1 | cut -d= -f2)"
if [ "$a2_rc" -eq 0 ] && [ "$a2_verdict" = "pass" ]; then
  record_item "a2-suites" "fresh" "$a2_rc" "run-machine-evidence: test 绑定套件绿"
  echo "  ✓ fresh（A2 套件绿）"
elif [ "$a2_rc" -eq 0 ] && [ "$a2_verdict" = "fail" ]; then
  record_item "a2-suites" "fail" "$a2_rc" "run-machine-evidence: 套件有失败（fail 证据已如实入库）"
  echo "  ✗ fail（A2 套件失败）"
  tail -5 "$a2_log" 2>/dev/null | sed 's/^/      log│ /' || true
elif [ "$a2_rc" -eq 0 ]; then
  record_item "a2-suites" "fresh" "$a2_rc" "run-machine-evidence 完成（无 verdict 行=无绑定套件，正常空跑）"
  echo "  ✓ fresh（A2 空跑）"
else
  record_item "a2-suites" "degraded" "$a2_rc" "run-machine-evidence exit=${a2_rc}（日志 ${a2_log}）"
  echo "  ⚠ degraded（A2 exit=${a2_rc}）" >&2
fi

# ── 4. 自动 refresh-all（内嵌 A2 写入由 SYNO_A2_SKIP_WRITE=1 关闭——证据已由本脚本写过，防重复/失真）──
if [ "$NO_REFRESH" = "1" ]; then
  echo "── refresh: --no-refresh 跳过（对照不刷新）"
  AFTER="$BEFORE"
  refresh_verdict="skip"; refresh_rc=0; refresh_note="--no-refresh 指定跳过"
else
  echo "── refresh-all（兑换链路: 新证据 → 六态重算）───────────"
  export SYNO_A2_SKIP_WRITE=1
  eval "$REFRESH_CMD" > "$LOG_DIR/refresh-$TODAY.log" 2>&1
  rf_rc=$?
  unset SYNO_A2_SKIP_WRITE || true
  AFTER="$(six_states "$PROGRESS_JSON")"
  if [ "$rf_rc" -eq 0 ]; then
    refresh_verdict="fresh"; refresh_rc=0; refresh_note="六态已重算"
  else
    refresh_verdict="degraded"; refresh_rc="$rf_rc"; refresh_note="refresh-all exit=${rf_rc}（日志 $LOG_DIR/refresh-$TODAY.log）"
    echo "  ⚠ degraded（refresh-all exit=${rf_rc}）" >&2
  fi
fi
record_item "refresh-all" "$refresh_verdict" "$refresh_rc" "$refresh_note"

# ── 5. 写汇总 JSON（幂等: 同日覆盖）──
"$PYBIN" - "$SUMMARY_FILE" "$TODAY" "$GEN_AT" "$ITEMS_JSON" \
  "$N_FRESH" "$N_FAIL" "$N_SKIP" "$N_DEGRADED" "$BEFORE" "$AFTER" <<'PYEOF'
import json, sys, os
out, today, gen_at, items = sys.argv[1:5]
n_fresh, n_fail, n_skip, n_deg = (int(x) for x in sys.argv[5:9])
before, after = sys.argv[9], sys.argv[10]
rec = {
    "schema": "rerun-summary/1",
    "date": today,
    "generated_at": gen_at,
    "source": "rerun-evidence.sh (D774)",
    "items": json.loads(items),
    "counts": {"fresh": n_fresh, "fail": n_fail, "skip": n_skip, "degraded": n_deg},
    "six_state_before": before,
    "six_state_after": after,
    "note": "fresh=重跑通过; fail=显式失败(证据如实入库); skip=机器不可代验(真机/founder/K3面); "
            "degraded=环境缺失(不写证据, fail-closed). 汇总不改判分——判分唯 calc-progress.py。",
}
os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
with open(out, "w", encoding="utf-8") as f:
    json.dump(rec, f, ensure_ascii=False, indent=2)
    f.write("\n")
PYEOF
if [ $? -ne 0 ]; then
  echo "degraded: 汇总写入失败（${SUMMARY_FILE}）" >&2
  exit 2
fi

# ── 6. 前后对照打印 ──
echo ""
echo "══ 刷新前后六态对照 ══════════════════════════════════════"
echo "  before: $BEFORE"
echo "  after : $AFTER"
"$PYBIN" - "$BEFORE" "$AFTER" <<'PYEOF'
import sys
def parse(s):
    if s == "absent":
        return None
    return {k: int(v) for k, v in (x.split("=") for x in s.split())}
b, a = parse(sys.argv[1]), parse(sys.argv[2])
if b is None or a is None:
    print("  Δ     : （进度 JSON 缺失，无法对照）")
    raise SystemExit
for k in ("uncommitted", "failed", "pending_k3", "verified", "rejected", "stale"):
    d = a.get(k, 0) - b.get(k, 0)
    mark = " ←" if d != 0 else ""
    print("  %-12s %4d → %-4d (Δ%+d)%s" % (k, b.get(k, 0), a.get(k, 0), d, mark))
PYEOF

# ── 7. 最终汇总打印 + 三态退出 ──
echo ""
echo "══ 重跑汇总（${TODAY}）════════════════════════════════════"
echo "  fresh=$N_FRESH  fail=$N_FAIL  skip=$N_SKIP  degraded=$N_DEGRADED"
echo "  汇总文件: $SUMMARY_FILE"

if [ "$N_FAIL" -gt 0 ]; then
  echo "✗ 存在 $N_FAIL 个显式 fail → exit 1（不静默吞）"
  exit 1
fi
if [ "$N_DEGRADED" -gt 0 ]; then
  echo "⚠ 无 fail 但 $N_DEGRADED 项降级 → exit 2（检查链受损，与通过不混同）"
  exit 2
fi
echo "✓ 全部可跑项 fresh → exit 0"
exit 0
