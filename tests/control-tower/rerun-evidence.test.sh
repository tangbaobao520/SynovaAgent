#!/usr/bin/env bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# rerun-evidence.test.sh — D774 证据保鲜流水线测试
#
# 覆盖矩阵（铁律 48 三路径 + 幂等 + 反向 + 接线）:
#   T1 全绿        — fake GS×2 全 exit 0 + fake vitest 绿 + fake A2 绿 + fake refresh
#                    → exit 0; 汇总 counts 断言; 证据文件真实落沙箱（真 evidence-writer）
#   T2 部分 fail   — fake GS-02 exit 1 → exit 1; 汇总 items 显式 GS-02 fail + exit_code
#   T3 环境缺失降级 — vitest 命令不存在 → exit 2; 沙箱证据目录零新增 test 证据（fail-closed）
#   T4 幂等        — T1 完成后连跑第二次 → exit 0; 证据文件数不变; counts 一致
#   T5 fail 优先级 — 同时有 fail 与 degraded → exit 1（fail 不被 degraded 吞）
#   T6 接线 WIRE CHECK — gen-expiry-warnings 被 refresh-all 调用 + rerun-evidence 在 README 登记
#
# 沙箱: mktemp + SYNO_RERUN_* 全量注入（零真实仓库写入，PLATFORM-CHECKLIST #6）
# 退出: 0 全过; 1 有断言失败
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RERUN="$REPO_ROOT/scripts/product-lines/rerun-evidence.sh"
REFRESH_ALL="$REPO_ROOT/scripts/product-lines/refresh-all.sh"
README="$REPO_ROOT/scripts/product-lines/README.md"

FAILS=0
ok()   { echo "  ✓ $1"; }
bad()  { echo "  ✗ $1"; FAILS=$((FAILS+1)); }
check(){ # $1=描述 $2=条件(0=真)
  if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1"; fi
}

# PLATFORM-CHECKLIST #6: mktemp 沙箱
TMPD="$(mktemp -d)"
trap 'rm -rf "$TMPD"' EXIT

FIX_TODAY="2026-09-16"

mk_sandbox() { # $1=名字 → 构造 fake 仓库数据面
  local box="$TMPD/$1"
  mkdir -p "$box/gs/evidence" "$box/evidence" "$box/summary" "$box/bin"
  echo "$box"
}

# fake GS 场景: $1=box $2=id $3=exit_code
mk_gs() {
  local box="$1" gid="$2" rc="$3"
  mkdir -p "$box/gs/${gid}-demo"
  cat > "$box/gs/${gid}-demo/run.sh" <<EOF
#!/usr/bin/env bash
# fake 场景（测试沙箱; 产物路径/日期经运行时环境展开）
echo "[$gid] fake run"
mkdir -p "\$SYNO_RERUN_GS_EVIDENCE_DIR"
echo '{"schema":1,"record_type":"scenario","date":"'"$FIX_TODAY"'","verdicts":[]}' \\
  > "\$SYNO_RERUN_GS_EVIDENCE_DIR/${gid}-\${SYNO_RERUN_TODAY}.json"
exit $rc
EOF
  chmod +x "$box/gs/${gid}-demo/run.sh"
}

# fake 子命令: $1=路径 $2=脚本体
mk_bin() {
  cat > "$1" <<EOF
$2
EOF
  chmod +x "$1"
}

run_rerun() { # $1=box; 其余参数=该轮环境覆盖; 全局 RERUN_ARGS=脚本参数
  local box="$1"; shift
  local args=()
  if [ -n "${RERUN_ARGS:-}" ]; then args=($RERUN_ARGS); fi
  SYNO_RERUN_GS_DIR="$box/gs" \
  SYNO_RERUN_EVIDENCE_DIR="$box/evidence" \
  SYNO_RERUN_SUMMARY_DIR="$box/summary" \
  SYNO_RERUN_PROGRESS_JSON="$box/summary/product-progress.json" \
  SYNO_RERUN_TODAY="$FIX_TODAY" \
  SYNO_RERUN_LOG_DIR="${TMPD}-logs" \
  env "$@" bash "$RERUN" ${args[@]+"${args[@]}"} > "$box/out.log" 2>&1
}

counts_of() { # $1=summary json $2=key → 数字
  python3 -c "import json;d=json.load(open('$1'));print(d['counts']['$2'])"
}

item_field() { # $1=summary json $2=id $3=字段
  python3 -c "
import json
d = json.load(open('$1'))
for it in d['items']:
    if it['id'] == '$2':
        print(it.get('$3', '')); break
"
}

echo "══ T1 全绿路径 ═════════════════════════════════════════"
BOX="$(mk_sandbox t1)"
# 预置"刷新前"进度快照（stale=29）→ 对照逻辑前后皆有值
cat > "$BOX/summary/product-progress.json" <<'J'
{"lines":[{"status_counts":{"uncommitted":96,"failed":2,"pending_k3":34,"verified":1,"rejected":2,"stale":29}}]}
J
mk_gs "$BOX" GS-01 0
mk_gs "$BOX" GS-02 0
mk_bin "$BOX/bin/vitest" '#!/usr/bin/env bash
echo "fake vitest green"; exit 0'
mk_bin "$BOX/bin/a2" '#!/usr/bin/env bash
echo "ℹ A2: ..."; echo "✓ A2 完成: 证据 verdict=pass 已入库"; exit 0'
# fake refresh: 写一份"刷新后"进度 JSON（stale 29→22, pending_k3 34→41）
mk_bin "$BOX/bin/refresh" "#!/usr/bin/env bash
mkdir -p \"$(dirname "$BOX/summary/product-progress.json")\"
cat > \"$BOX/summary/product-progress.json\" <<'J'
{\"lines\":[{\"status_counts\":{\"uncommitted\":96,\"failed\":2,\"pending_k3\":41,\"verified\":1,\"rejected\":2,\"stale\":22}}]}
J
exit 0"
RERUN_ARGS=""
run_rerun "$BOX" \
  SYNO_RERUN_VITEST_CMD="$BOX/bin/vitest" \
  SYNO_RERUN_A2_CMD="bash $BOX/bin/a2" \
  SYNO_RERUN_REFRESH_CMD="bash $BOX/bin/refresh"
RC=$?
check "exit 0（全绿）" $([ $RC -eq 0 ] && echo 0 || echo 1)
SUM="$BOX/summary/rerun-evidence-summary-$FIX_TODAY.json"
check "汇总文件生成" $([ -f "$SUM" ] && echo 0 || echo 1)
check "GS-01 fresh" $([ "$(item_field "$SUM" GS-01 verdict)" = "fresh" ] && echo 0 || echo 1)
check "vitest 证据落沙箱（真 evidence-writer）" \
  $([ -n "$(ls "$BOX/evidence"/test-$FIX_TODAY*.json 2>/dev/null)" ] && echo 0 || echo 1)
check "skip 登记（1-2 founder 面 + 1-8 K3 面）" \
  $([ "$(item_field "$SUM" 1-2 verdict)" = "skip" ] && [ "$(item_field "$SUM" 1-8 verdict)" = "skip" ] && echo 0 || echo 1)
check "GS 场景证据产物（fake 场景写入）" \
  $([ -f "$BOX/gs/evidence/GS-01-$FIX_TODAY.json" ] && echo 0 || echo 1)
check "对照链完整（before=29 → after=22, Δ 标记）" \
  $(grep -q "uncommitted.*96.*22" "$BOX/out.log" && grep -q "Δ-7" "$BOX/out.log" && echo 0 || echo 1)
check "汇总 counts.fresh=5（GS×2+vitest+a2+refresh）" \
  $([ "$(counts_of "$SUM" fresh)" = "5" ] && echo 0 || echo 1)
check "汇总 six_state_after 已回填（stale=22）" \
  $(python3 -c "import json;d=json.load(open('$SUM'));print(0 if 'stale=22' in d['six_state_after'] else 1)")

echo ""
echo "══ T2 部分 fail（反向验证: 显式 fail + 非零退出）══════════════"
BOX2="$(mk_sandbox t2)"
mk_gs "$BOX2" GS-01 0
mk_gs "$BOX2" GS-02 1   # ← 故意失败
mk_bin "$BOX2/bin/vitest" '#!/usr/bin/env bash
echo "fake vitest green"; exit 0'
mk_bin "$BOX2/bin/a2" '#!/usr/bin/env bash
echo "✓ A2 完成: 证据 verdict=pass 已入库"; exit 0'
mk_bin "$BOX2/bin/refresh" '#!/usr/bin/env bash
exit 0'
RERUN_ARGS="--no-refresh"
run_rerun "$BOX2" \
  SYNO_RERUN_VITEST_CMD="$BOX2/bin/vitest" \
  SYNO_RERUN_A2_CMD="bash $BOX2/bin/a2" \
  SYNO_RERUN_REFRESH_CMD="bash $BOX2/bin/refresh"
RC=$?
check "exit 1（有 fail 不静默）" $([ $RC -eq 1 ] && echo 0 || echo 1)
SUM2="$BOX2/summary/rerun-evidence-summary-$FIX_TODAY.json"
check "汇总显式 GS-02 fail" $([ "$(item_field "$SUM2" GS-02 verdict)" = "fail" ] && echo 0 || echo 1)
check "fail 条目带 exit_code" $([ "$(item_field "$SUM2" GS-02 exit_code)" = "1" ] && echo 0 || echo 1)
check "失败不中断全局（GS-01 仍 fresh）" $([ "$(item_field "$SUM2" GS-01 verdict)" = "fresh" ] && echo 0 || echo 1)

echo ""
echo "══ T3 环境缺失降级（vitest 不可用 → 不写证据 fail-closed）══════"
BOX3="$(mk_sandbox t3)"
mk_gs "$BOX3" GS-01 0
mk_bin "$BOX3/bin/a2" '#!/usr/bin/env bash
echo "✓ A2 完成: 证据 verdict=pass 已入库"; exit 0'
mk_bin "$BOX3/bin/refresh" '#!/usr/bin/env bash
exit 0'
RERUN_ARGS="--no-refresh"
run_rerun "$BOX3" \
  SYNO_RERUN_VITEST_CMD="/nonexistent/path/to/vitest" \
  SYNO_RERUN_A2_CMD="bash $BOX3/bin/a2" \
  SYNO_RERUN_REFRESH_CMD="bash $BOX3/bin/refresh"
RC=$?
check "exit 2（降级 ≠ 通过，D328 三态）" $([ $RC -eq 2 ] && echo 0 || echo 1)
SUM3="$BOX3/summary/rerun-evidence-summary-$FIX_TODAY.json"
check "line1-vitest 登记为 degraded" $([ "$(item_field "$SUM3" line1-vitest verdict)" = "degraded" ] && echo 0 || echo 1)
check "零 test 证据写入（fail-closed 铁律 11）" \
  $([ -z "$(ls "$BOX3/evidence"/test-$FIX_TODAY*.json 2>/dev/null)" ] && echo 0 || echo 1)

echo ""
echo "══ T4 幂等（连跑两次: 零新增文件 + counts 一致）═══════════════"
RERUN_ARGS=""
run_rerun "$BOX" \
  SYNO_RERUN_VITEST_CMD="$BOX/bin/vitest" \
  SYNO_RERUN_A2_CMD="bash $BOX/bin/a2" \
  SYNO_RERUN_REFRESH_CMD="bash $BOX/bin/refresh"
RC2=$?
check "第二次 exit 0" $([ $RC2 -eq 0 ] && echo 0 || echo 1)
check "第二次 vitest 证据零新增（dedupe）" \
  $([ "$(ls "$BOX/evidence"/test-$FIX_TODAY*.json 2>/dev/null | wc -l | tr -d ' ')" = "1" ] && echo 0 || echo 1)
check "第二次汇总结论一致（fresh=5）" \
  $([ "$(counts_of "$SUM" fresh)" = "5" ] && echo 0 || echo 1)
check "汇总文件仍 1 份（同日覆盖）" \
  $([ "$(ls "$BOX/summary"/rerun-evidence-summary-*.json 2>/dev/null | wc -l | tr -d ' ')" = "1" ] && echo 0 || echo 1)

echo ""
echo "══ T5 fail 优先于 degraded（不被降级吞）══════════════════════"
BOX5="$(mk_sandbox t5)"
mk_gs "$BOX5" GS-01 1          # fail
mk_bin "$BOX5/bin/a2" '#!/usr/bin/env bash
exit 2'                          # degraded
RERUN_ARGS="--skip-vitest --no-refresh"
run_rerun "$BOX5" \
  SYNO_RERUN_VITEST_CMD="true" \
  SYNO_RERUN_A2_CMD="bash $BOX5/bin/a2" \
  SYNO_RERUN_REFRESH_CMD="true"
RC5=$?
check "exit 1（fail > degraded 优先级）" $([ $RC5 -eq 1 ] && echo 0 || echo 1)
SUM5="$BOX5/summary/rerun-evidence-summary-$FIX_TODAY.json"
check "fail 与 degraded 同时在册" \
  $([ "$(item_field "$SUM5" GS-01 verdict)" = "fail" ] && [ "$(item_field "$SUM5" a2-suites verdict)" = "degraded" ] && echo 0 || echo 1)

echo ""
echo "══ T6 接线 WIRE CHECK（铁律 0-2）════════════════════════════"
check "gen-expiry-warnings 被 refresh-all 调用（A9）" \
  $(grep -q "gen-expiry-warnings" "$REFRESH_ALL" && echo 0 || echo 1)
check "rerun-evidence 在 README 登记" \
  $(grep -q "rerun-evidence" "$README" && echo 0 || echo 1)
check "rerun-evidence.sh 可执行权限" \
  $([ -x "$RERUN" ] && echo 0 || echo 1)
check "gen-expiry-warnings.py 语法" \
  $(python3 -c "compile(open('$REPO_ROOT/scripts/product-lines/gen-expiry-warnings.py').read(),'x','exec')" && echo 0 || echo 1)
check "rerun-evidence.sh bash 语法" \
  $(bash -n "$RERUN" && echo 0 || echo 1)

echo ""
echo "══ 附加: gen-expiry-warnings 沙箱冒烟（正常/空目录/坏yaml 三态）══"
EXPBOX="$TMPD/exp"
mkdir -p "$EXPBOX/evidence"
# 正常: 不同点不同日期——1-1 十五天前 → expired; 7-1 十天前 → expiring（同点取最新，防数据自相冲突）
python3 - "$EXPBOX" <<'PYEOF'
import json, sys, os
box = sys.argv[1]
def w(name, d, pid, verdict="pass"):
    rec = {"schema": 1, "record_type": "test", "date": d,
           "verdicts": [{"acceptance_point": pid, "verdict": verdict, "quote": "t"}]}
    with open(os.path.join(box, "evidence", name), "w") as f:
        json.dump(rec, f)
w("test-old.json", "2026-09-01", "1-1")   # +14d = 09-15 < today → expired
w("test-mid.json", "2026-09-06", "7-1")   # +14d = 09-20, 剩 4 天 ≤ 7 → expiring
with open(os.path.join(box, "evidence", "bad.json"), "w") as f:
    f.write("{not json")
PYEOF
cat > "$EXPBOX/pl.yaml" <<'YAML'
lines:
  - id: 1
    name: "桌面端"
    acceptance_points:
      - id: "1-1"
        desc: "测试点"
YAML
python3 "$REPO_ROOT/scripts/product-lines/gen-expiry-warnings.py" \
  --yaml "$EXPBOX/pl.yaml" --evidence-dir "$EXPBOX/evidence" \
  --out "$EXPBOX/out.json" --today "$FIX_TODAY" >/dev/null 2>&1
check "预警脚本 exit 0" $([ $? -eq 0 ] && echo 0 || echo 1)
check "expired 含 1-1（15 天前证据）" \
  $(python3 -c "import json;d=json.load(open('$EXPBOX/out.json'));print(0 if any(e['point']=='1-1' and e['expire_date']=='2026-09-15' for e in d['expired']) else 1)")
check "expiring 阈值（剩 4 天 ≤ 7）" \
  $(python3 -c "import json;d=json.load(open('$EXPBOX/out.json'));print(0 if len(d['expiring'])==1 else 1)")
# 坏 yaml → exit 2 fail-closed
echo "{{{broken" > "$EXPBOX/bad.yaml"
python3 "$REPO_ROOT/scripts/product-lines/gen-expiry-warnings.py" \
  --yaml "$EXPBOX/bad.yaml" --evidence-dir "$EXPBOX/evidence" \
  --out "$EXPBOX/out2.json" --today "$FIX_TODAY" >/dev/null 2>&1
check "坏 yaml → exit 2（fail-closed）" $([ $? -eq 2 ] && echo 0 || echo 1)

echo ""
echo "══════════════════════════════════════════════════════════"
if [ "$FAILS" -eq 0 ]; then
  echo "✓ rerun-evidence.test.sh 全部断言通过"
  exit 0
fi
echo "✗ $FAILS 个断言失败"
exit 1
