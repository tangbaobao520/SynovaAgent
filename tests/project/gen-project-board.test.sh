#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# gen-project-board.test.sh — D795 项目账本派生器密封测试
#
# 被测对象: scripts/project/gen-project-board.py
#   @input  — 只读 task-state/*.json + product-lines.yaml + V1 断言表 + 两处证据目录
#   @output — ledger.json（schema project-ledger/1）
#   @degraded — 任一输入缺失/坏 → degraded:true + degraded_sources[]（默认 exit 0，--strict 非零）
#
# 覆盖矩阵（派单 §B.5 五组 + 真实仓库冒烟，全密封临时夹具，禁写真仓库）:
#   ① 正常路径 — 手算数字对账（交付度/验证率/保鲜/backlog/两处证据来源）
#   ② 反向     — 删证据 → 该断言 ok 由 true 回退 false（证明非硬编码）
#   ③ 降级     — 缺 yaml / 坏 JSON → degraded:true + degraded_sources 非空 + 退出码契约
#   ④ 保鲜边界 — 7 天=🟢 / 8 天=🟡 / 14 天=🟡 / 15 天=🔴，且**不扣交付度**（口径红线）
#   ⑤ 幂等     — 连跑两次，除 generated_at/git_head 外逐键相等
#   ⑥ 真实仓库 — 只读冒烟: v1_total=125 + lines=26（输出到临时文件，不污染仓库）
#
# 沙箱: mktemp 临时夹具 + 固定时钟 --today（零平台 date 差异，Win/CI 确定性）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SUT="$REPO/scripts/project/gen-project-board.py"
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

TODAY="2026-09-17"   # 固定时钟: 保鲜分桶与 days 计算全部相对它
V1_NAME="26线-V1验收标准-草案v0.1-20260917.md"

# ── 工具 ──────────────────────────────────────────────────────
dago() { "$PYBIN" -c "import datetime,sys;print((datetime.date.fromisoformat(sys.argv[1])-datetime.timedelta(days=int(sys.argv[2]))).isoformat())" "$TODAY" "$1"; }

jget() { # jget <json-file> <dotted.path>；列表用数字下标
  "$PYBIN" - "$1" "$2" <<'PY'
import json,sys
cur=json.load(open(sys.argv[1],encoding='utf-8'))
for part in sys.argv[2].split('.'):
    if part=='': continue
    cur = cur[int(part)] if isinstance(cur,list) else cur.get(part)
    if cur is None: break
print(json.dumps(cur,ensure_ascii=False,sort_keys=True) if isinstance(cur,(dict,list)) else cur)
PY
}

mk_evidence() { # mk_evidence <path> <record_type> <date> <acceptance_point> [verdict]
  "$PYBIN" - "$1" "$2" "$3" "$4" "${5:-pass}" <<'PY'
import json,sys
path,rtype,date,ap,verdict = sys.argv[1:6]
json.dump({"schema":1,"record_type":rtype,"date":date,"source":"fixture",
           "verdicts":[{"acceptance_point":ap,"verdict":verdict,"quote":"fixture quote"}]},
          open(path,"w",encoding="utf-8"), ensure_ascii=False, indent=1)
PY
}

run_sut() { # run_sut <fixture-root> <out-file> [extra args...]
  local root="$1" out="$2"; shift 2
  "$PYBIN" "$SUT" --repo-root "$root" --out "$out" --today "$TODAY" "$@"
}

# ── 夹具构造 ──────────────────────────────────────────────────
build_fixture() { # build_fixture <dir>
  local F="$1"
  mkdir -p "$F/task-state" "$F/docs/synova/product-lines/evidence" \
           "$F/docs/synova/project" "$F/scripts/golden-scenarios/evidence"

  cat > "$F/docs/synova/project/$V1_NAME" <<'MD'
# 26 线 V1 验收标准（断言版）· 草案 v0.1

## 〇、口径（签字即冻结）

| 项 | 定义 |
|---|---|
| **V1** | 一条线的最小可用闭环 |

## 二、逐线 V1 断言（可判定）

### 线1 桌面端
- 价值: 夹具线一
- DoD: 夹具做完定义一
- 底数: 0%
- V1 断言:
| ID | 断言（判定式） | verify | 证据 | fail_when |
|---|---|---|---|---|
| 1-1 | 断言甲可判定 | cmd-a | scenario | 甲不成立 |
| 1-2 | 断言乙可判定 | K3 报告 PASS | k3 | 乙不成立 |
- V1 外（backlog）: 1-5 双引导 / 1-6 计时

### 线2 对话交互
- 价值: 夹具线二
- DoD: 夹具做完定义二
- 底数: 0%
- V1 断言:
| ID | 断言（判定式） | verify | 证据 | fail_when |
|---|---|---|---|---|
| 2-1 | 断言丙可判定 | 套件绿 | test | 丙不成立 |
| 2-2 | 断言丁可判定 | 真机实测 | founder-demo | 丁不成立 |
- V1 外（backlog）: 2-4 主动说话
- 阻塞: 无
MD

  cat > "$F/docs/synova/product-lines/product-lines.yaml" <<'YML'
version: 1.0
total_lines: 2
lines:
  - id: 1
    name: "桌面端"
    done_definition: "夹具做完定义一"
    acceptance_points:
      - id: "1-1"
        desc: "甲"
        evidence: ["scenario:GS-01"]
        status: uncommitted
      - id: "1-2"
        desc: "乙"
        evidence: ["k3:x"]
        status: uncommitted
      - id: "1-5"
        desc: "戊"
        evidence: ["scenario:GS-01"]
        status: uncommitted
      - id: "1-6"
        desc: "己"
        evidence: ["scenario:GS-01"]
        status: uncommitted
  - id: 2
    name: "对话交互"
    done_definition: "夹具做完定义二"
    acceptance_points:
      - id: "2-1"
        desc: "丙"
        evidence: ["test:y"]
        status: uncommitted
      - id: "2-2"
        desc: "丁"
        evidence: ["founder-demo:z"]
        status: uncommitted
      - id: "2-4"
        desc: "庚"
        evidence: ["scenario:GS-01"]
        status: uncommitted
YML

  cat > "$F/task-state/D001.json" <<'JSON'
{"task_id":"D001","title":"夹具卡","status":"impl_done","owner":"mac","updated_at":"2026-09-15",
 "blocked":null,"depends_on":[]}
JSON
  cat > "$F/task-state/D002.json" <<'JSON'
{"task_id":"D002","title":"夹具阻塞卡","status":"claimed","owner":"win","updated_at":"2026-09-10",
 "blocked":{"reason":"等 Win 真机","since":"2026-09-15","needs":"Win 机器"}}
JSON
  cat > "$F/task-state/D003.json" <<'JSON'
{"task_id":"D003","title":"夹具半阻塞卡（缺 needs，不计入）","status":"claimed","owner":"mac",
 "updated_at":"2026-09-16","blocked":{"reason":"原因","since":"2026-09-15"}}
JSON

  # 证据: 1-1 scenario(龄3绿) / 1-2 k3(龄10黄) / 2-1 test(龄20红，放 GS 目录证明两处都算)
  mk_evidence "$F/docs/synova/product-lines/evidence/ev-scenario-1-1.json" scenario "$(dago 3)" 1-1
  mk_evidence "$F/docs/synova/product-lines/evidence/ev-k3-1-2.json"       k3       "$(dago 10)" 1-2
  mk_evidence "$F/scripts/golden-scenarios/evidence/ev-test-2-1.json"     test     "$(dago 20)" 2-1
}

echo "=== D795: gen-project-board（项目账本派生器）==="

# ═══ 组 ① 正常路径 — 手算对账 ═══
echo "① 正常路径（手算对账）"
F1="$TMPD/normal"; build_fixture "$F1"; OUT1="$TMPD/normal.json"
run_sut "$F1" "$OUT1" >/dev/null 2>&1
if [ -f "$OUT1" ]; then
  ok "产出 ledger.json"
else
  no "未产出 ledger.json（SUT 缺失或崩溃）"; echo; echo "PASS=$PASS FAIL=$FAIL"; exit 1
fi
[ "$(jget "$OUT1" schema)" = "project-ledger/1" ] && ok "schema=project-ledger/1" || no "schema 错: $(jget "$OUT1" schema)"
[ "$(jget "$OUT1" degraded)" = "False" ]          && ok "degraded=false（完好夹具）" || no "degraded 应为 false: $(jget "$OUT1" degraded)"
[ "$(jget "$OUT1" totals.v1_total)" = "4" ]       && ok "v1_total=4"        || no "v1_total 应 4，实 $(jget "$OUT1" totals.v1_total)"
[ "$(jget "$OUT1" totals.v1_passed)" = "3" ]      && ok "v1_passed=3"       || no "v1_passed 应 3，实 $(jget "$OUT1" totals.v1_passed)"
[ "$(jget "$OUT1" totals.v1_verified)" = "1" ]    && ok "v1_verified=1（仅 1-2 有 k3 PASS）" || no "v1_verified 应 1，实 $(jget "$OUT1" totals.v1_verified)"
[ "$(jget "$OUT1" totals.delivery_pct)" = "75.0" ] && ok "delivery_pct=75.0" || no "delivery_pct 应 75.0，实 $(jget "$OUT1" totals.delivery_pct)"
[ "$(jget "$OUT1" totals.verify_pct)" = "33.3" ]  && ok "verify_pct=33.3（1/3）" || no "verify_pct 应 33.3，实 $(jget "$OUT1" totals.verify_pct)"
[ "$(jget "$OUT1" totals.freshness)" = '{"green": 1, "red": 1, "yellow": 1}' ] \
  && ok "freshness green1/yellow1/red1（龄 3/10/20）" || no "freshness 错: $(jget "$OUT1" totals.freshness)"
[ "$(jget "$OUT1" totals.backlog_points)" = "3" ] && ok "backlog_points=3（yaml 7 点 - V1 4 条）" || no "backlog_points 应 3，实 $(jget "$OUT1" totals.backlog_points)"
[ "$(jget "$OUT1" totals.blocked_count)" = "1" ]  && ok "blocked_count=1（D003 缺 needs 不计入）" || no "blocked_count 应 1，实 $(jget "$OUT1" totals.blocked_count)"
[ "$(jget "$OUT1" lines | "$PYBIN" -c 'import json,sys;print(len(json.load(sys.stdin)))')" = "2" ] \
  && ok "lines=2 条" || no "lines 数错"
[ "$(jget "$OUT1" lines.0.name)" = "桌面端" ]     && ok "线1 name 来自 yaml"  || no "线1 name 错: $(jget "$OUT1" lines.0.name)"
[ "$(jget "$OUT1" lines.0.done_definition)" = "夹具做完定义一" ] && ok "线1 done_definition 来自 yaml" || no "线1 done_definition 错"
[ "$(jget "$OUT1" lines.0.v1_total)" = "2" ]      && ok "线1 v1_total=2" || no "线1 v1_total 应 2，实 $(jget "$OUT1" lines.0.v1_total)"
[ "$(jget "$OUT1" lines.0.v1_passed)" = "2" ]     && ok "线1 v1_passed=2" || no "线1 v1_passed 应 2"
[ "$(jget "$OUT1" lines.0.v1_verified)" = "1" ]   && ok "线1 v1_verified=1" || no "线1 v1_verified 应 1"
[ "$(jget "$OUT1" lines.1.v1_passed)" = "1" ]     && ok "线2 v1_passed=1" || no "线2 v1_passed 应 1"
[ "$(jget "$OUT1" lines.1.assertions.0.ok)" = "True" ]  && ok "2-1 ok=true" || no "2-1 ok 应 true"
[ "$(jget "$OUT1" lines.1.assertions.1.ok)" = "False" ] && ok "2-2 ok=false（无 founder-demo 证据）" || no "2-2 ok 应 false"
[ "$(jget "$OUT1" lines.1.assertions.1.age_days)" = "None" ] && ok "2-2 age_days=null（无证据）" || no "2-2 age_days 应 null"
grep -q "golden-scenarios/evidence" "$OUT1" \
  && ok "两处证据都算: 2-1 证据来源标 golden-scenarios" || no "GS 目录证据未被计入（K3-B5-P1 静默丢弃同型）"
grep -q "product-lines/evidence" "$OUT1" \
  && ok "sources 标明 product-lines/evidence" || no "sources 未标明产品证据目录"
[ "$(jget "$OUT1" sources.v1_dod | grep -c "$V1_NAME")" = "1" ] && ok "sources.v1_dod 指向断言表" || no "sources.v1_dod 错"
[ "$(jget "$OUT1" tasks | "$PYBIN" -c 'import json,sys;print(len(json.load(sys.stdin)))')" = "3" ] \
  && ok "tasks=3 张卡" || no "tasks 数错"
[ "$(jget "$OUT1" tasks.0.id)" = "D001" ] && ok "tasks 按 id 排序" || no "tasks.0.id 应 D001，实 $(jget "$OUT1" tasks.0.id)"
[ "$(jget "$OUT1" blocked.0.id)" = "D002" ] && ok "blocked 只含三要素齐全的 D002" || no "blocked.0.id 应 D002，实 $(jget "$OUT1" blocked.0.id)"
[ "$(jget "$OUT1" blocked.0.days)" = "2" ]  && ok "blocked days=2（today 2026-09-17 - since 09-15）" || no "blocked days 应 2，实 $(jget "$OUT1" blocked.0.days)"
[ "$(jget "$OUT1" blocked.0.needs)" = "Win 机器" ] && ok "blocked needs 透传" || no "blocked needs 错"

# ═══ 组 ② 反向 — 删证据 → 状态回退 ═══
echo "② 反向验证（删证据 → ok 回退）"
B_BEFORE="$(jget "$OUT1" lines.0.assertions.0.ok)"
rm -f "$F1/docs/synova/product-lines/evidence/ev-scenario-1-1.json"
OUT2="$TMPD/reverse.json"; run_sut "$F1" "$OUT2" >/dev/null 2>&1
B_AFTER="$(jget "$OUT2" lines.0.assertions.0.ok)"
[ "$B_BEFORE" = "True" ]  && ok "改前: 1-1 ok=true"  || no "改前 1-1 ok 应 true，实 $B_BEFORE"
[ "$B_AFTER" = "False" ]  && ok "改后: 1-1 ok=false（非硬编码）" || no "改后 1-1 ok 应 false，实 $B_AFTER"
[ "$(jget "$OUT2" totals.v1_passed)" = "2" ] && ok "删证据后 v1_passed 3→2" || no "v1_passed 应回退到 2，实 $(jget "$OUT2" totals.v1_passed)"
[ "$(jget "$OUT2" totals.freshness.green)" = "0" ] && ok "删证据后 green 1→0" || no "green 应回退到 0，实 $(jget "$OUT2" totals.freshness.green)"

# ═══ 组 ③ 降级 — 缺文件 / 坏 JSON ═══
echo "③ 降级（缺 yaml / 坏 JSON）"
F3="$TMPD/degraded"; build_fixture "$F3"
rm -f "$F3/docs/synova/product-lines/product-lines.yaml"
OUT3="$TMPD/degraded.json"
run_sut "$F3" "$OUT3" >/dev/null 2>&1; RC3=$?
[ "$RC3" = "0" ] && ok "缺 yaml 默认 exit 0（文件仍写出，降级在带内）" || no "缺 yaml 默认应 exit 0，实 $RC3"
[ "$(jget "$OUT3" degraded)" = "True" ] && ok "缺 yaml → degraded=true" || no "缺 yaml 应 degraded=true"
[ "$("$PYBIN" -c "import json,sys;print(len(json.load(open(sys.argv[1],encoding='utf-8'))['degraded_sources']))" "$OUT3")" != "0" ] \
  && ok "缺 yaml → degraded_sources 非空" || no "degraded_sources 为空（静默降级）"
grep -q "product-lines.yaml" "$OUT3" && ok "degraded_sources 点名 product-lines.yaml" || no "未点名缺失文件"
[ "$(jget "$OUT3" totals.backlog_points)" = "None" ] && ok "缺 yaml → backlog_points=null（不静默填 0）" || no "backlog_points 应 null，实 $(jget "$OUT3" totals.backlog_points)"
run_sut "$F3" "$OUT3" --strict >/dev/null 2>&1; RC3S=$?
[ "$RC3S" != "0" ] && ok "--strict 下降级 → 退出码非零（${RC3S}）" || no "--strict 应非零退出"

F3B="$TMPD/badjson"; build_fixture "$F3B"
printf '{ this is not json' > "$F3B/docs/synova/product-lines/evidence/broken.json"
OUT3B="$TMPD/badjson.json"; run_sut "$F3B" "$OUT3B" >/dev/null 2>&1
[ "$(jget "$OUT3B" degraded)" = "True" ] && ok "坏 JSON → degraded=true" || no "坏 JSON 应 degraded=true"
grep -q "broken.json" "$OUT3B" && ok "degraded_sources 点名坏文件" || no "未点名坏 JSON 文件"
[ "$(jget "$OUT3B" totals.v1_passed)" = "3" ] && ok "坏 JSON 不污染其余证据（v1_passed 仍 3）" || no "坏 JSON 影响了计数"
[ "$(jget "$OUT3B" lines.0.assertions.0.ok)" = "True" ] && ok "坏 JSON 不打断其余断言判定" || no "坏 JSON 打断了判定"

# 记录级非证据（真实仓库实证: D524 自述式校验记录 record_type=d524-verify 无 verdicts）
# JSON 合法但不携带逐点裁决 → 登记 skipped_sources，**不计 degraded**（否则真实仓库永久红灯）
F3C="$TMPD/skipped"; build_fixture "$F3C"
printf '{"schema":1,"record_type":"d524-verify","date":"2026-08-25","verdict":"PASS"}' \
  > "$F3C/docs/synova/product-lines/evidence/self-report.json"
OUT3C="$TMPD/skipped.json"; run_sut "$F3C" "$OUT3C" >/dev/null 2>&1
[ "$(jget "$OUT3C" degraded)" = "False" ] && ok "非 verdicts 记录不触发 degraded" || no "非 verdicts 记录误触发 degraded（红灯会成常态）"
[ "$("$PYBIN" -c "import json,sys;print(len(json.load(open(sys.argv[1],encoding='utf-8'))['skipped_sources']))" "$OUT3C")" != "0" ] \
  && ok "非 verdicts 记录登记进 skipped_sources（不静默吞）" || no "skipped_sources 为空（静默吞掉）"
grep -q "self-report.json" "$OUT3C" && ok "skipped_sources 点名该文件" || no "未点名被跳过的文件"
[ "$(jget "$OUT3C" totals.v1_passed)" = "3" ] && ok "非 verdicts 记录不影响计数" || no "计数被非证据记录影响"

# ═══ 组 ④ 保鲜边界 — 7/8/14/15 天 ═══
echo "④ 保鲜边界（7=🟢 / 8=🟡 / 14=🟡 / 15=🔴，且不扣交付度）"
F4="$TMPD/boundary"
mkdir -p "$F4/task-state" "$F4/docs/synova/product-lines/evidence" "$F4/docs/synova/project" "$F4/scripts/golden-scenarios/evidence"
cat > "$F4/docs/synova/project/$V1_NAME" <<'MD'
### 线1 保鲜边界
| ID | 断言（判定式） | verify | 证据 | fail_when |
|---|---|---|---|---|
| 1-1 | 龄 7 天 | v | scenario | x |
| 1-2 | 龄 8 天 | v | scenario | x |
| 1-3 | 龄 14 天 | v | scenario | x |
| 1-4 | 龄 15 天 | v | scenario | x |
MD
cat > "$F4/docs/synova/product-lines/product-lines.yaml" <<'YML'
version: 1.0
lines:
  - id: 1
    name: "保鲜边界"
    done_definition: "d"
    acceptance_points:
      - id: "1-1"
        desc: "a"
      - id: "1-2"
        desc: "b"
      - id: "1-3"
        desc: "c"
      - id: "1-4"
        desc: "d"
YML
mk_evidence "$F4/docs/synova/product-lines/evidence/b7.json"  scenario "$(dago 7)"  1-1
mk_evidence "$F4/docs/synova/product-lines/evidence/b8.json"  scenario "$(dago 8)"  1-2
mk_evidence "$F4/docs/synova/product-lines/evidence/b14.json" scenario "$(dago 14)" 1-3
mk_evidence "$F4/docs/synova/product-lines/evidence/b15.json" scenario "$(dago 15)" 1-4
OUT4="$TMPD/boundary.json"; run_sut "$F4" "$OUT4" >/dev/null 2>&1
[ "$(jget "$OUT4" lines.0.assertions.0.age_days)" = "7" ]  && ok "7 天 age_days=7"  || no "age_days 应 7，实 $(jget "$OUT4" lines.0.assertions.0.age_days)"
[ "$(jget "$OUT4" lines.0.assertions.0.freshness)" = "green" ]  && ok "7 天 → 🟢 green"  || no "7 天应 green，实 $(jget "$OUT4" lines.0.assertions.0.freshness)"
[ "$(jget "$OUT4" lines.0.assertions.1.freshness)" = "yellow" ] && ok "8 天 → 🟡 yellow" || no "8 天应 yellow，实 $(jget "$OUT4" lines.0.assertions.1.freshness)"
[ "$(jget "$OUT4" lines.0.assertions.2.freshness)" = "yellow" ] && ok "14 天 → 🟡 yellow（边界含 14）" || no "14 天应 yellow，实 $(jget "$OUT4" lines.0.assertions.2.freshness)"
[ "$(jget "$OUT4" lines.0.assertions.3.freshness)" = "red" ]    && ok "15 天 → 🔴 red"    || no "15 天应 red，实 $(jget "$OUT4" lines.0.assertions.3.freshness)"
[ "$(jget "$OUT4" totals.freshness)" = '{"green": 1, "red": 1, "yellow": 2}' ] \
  && ok "分桶 green1/yellow2/red1" || no "分桶错: $(jget "$OUT4" totals.freshness)"
[ "$(jget "$OUT4" totals.v1_passed)" = "4" ] && ok "🟡🔴 仍计交付度: v1_passed=4（口径红线：保鲜不扣交付度）" \
  || no "过期证据被扣交付度，违反 09-17 口径（实 v1_passed=$(jget "$OUT4" totals.v1_passed)）"
[ "$(jget "$OUT4" totals.delivery_pct)" = "100.0" ] && ok "delivery_pct=100.0（龄 15 天不减分）" || no "delivery_pct 应 100.0"

# ═══ 组 ⑤ 幂等 — 连跑两次逐键相等 ═══
echo "⑤ 幂等（连跑两次，除 generated_at/git_head 外逐键相等）"
F5="$TMPD/idem"; build_fixture "$F5"
IA="$TMPD/idem-a.json"; IB="$TMPD/idem-b.json"
run_sut "$F5" "$IA" >/dev/null 2>&1
run_sut "$F5" "$IB" >/dev/null 2>&1
DIFF="$("$PYBIN" - "$IA" "$IB" <<'PY'
import json,sys
a=json.load(open(sys.argv[1],encoding='utf-8')); b=json.load(open(sys.argv[2],encoding='utf-8'))
for k in ("generated_at","git_head"):
    a.pop(k,None); b.pop(k,None)
def walk(x,y,p=""):
    out=[]
    if type(x) is not type(y): return [p+" type %s!=%s" % (type(x).__name__,type(y).__name__)]
    if isinstance(x,dict):
        for k in sorted(set(x)|set(y)):
            if k not in x: out.append(p+"/"+k+" only-in-b")
            elif k not in y: out.append(p+"/"+k+" only-in-a")
            else: out+=walk(x[k],y[k],p+"/"+k)
    elif isinstance(x,list):
        if len(x)!=len(y): out.append(p+" len %d!=%d" % (len(x),len(y)))
        else:
            for i,(u,v) in enumerate(zip(x,y)): out+=walk(u,v,p+"[%d]"%i)
    elif x!=y: out.append("%s %r!=%r" % (p,x,y))
    return out
d=walk(a,b)
print("\n".join(d[:20]))
PY
)"
if [ -z "$DIFF" ]; then ok "两次运行逐键相等（generated_at/git_head 除外）"; else no "幂等失败: $DIFF"; fi
[ "$(jget "$IA" generated_at)" = "$(jget "$IB" generated_at)" ] || ok "generated_at 可随运行变化（已豁免）"

# ═══ 组 ⑥ 真实仓库冒烟（只读，输出到临时文件）═══
echo "⑥ 真实仓库冒烟（只读）"
V1_REAL="$REPO/docs/synova/project/$V1_NAME"
if [ -f "$V1_REAL" ]; then
  OUT6="$TMPD/real.json"
  run_sut "$REPO" "$OUT6" >/dev/null 2>&1; RC6=$?
  [ "$RC6" = "0" ] && ok "真实仓库 exit 0" || no "真实仓库 exit $RC6"
  [ "$(jget "$OUT6" totals.v1_total)" = "125" ] && ok "真实仓库 v1_total=125（分母冻结）" \
    || no "真实仓库 v1_total 应 125，实 $(jget "$OUT6" totals.v1_total)"
  [ "$(jget "$OUT6" lines | "$PYBIN" -c 'import json,sys;print(len(json.load(sys.stdin)))')" = "26" ] \
    && ok "真实仓库 lines=26" || no "真实仓库 lines 应 26"
  [ "$(jget "$OUT6" totals.backlog_points)" = "39" ] && ok "真实仓库 backlog_points=39（164-125）" \
    || no "backlog_points 应 39，实 $(jget "$OUT6" totals.backlog_points)"
else
  no "真实仓库缺 V1 断言表 ${V1_NAME}（上游 D793/PR#608 未并入）"
fi
# 只读证明: 夹具与真实仓库均不得被写
[ ! -f "$REPO/docs/synova/project/ledger.json.tmp" ] && ok "未在真实仓库留临时文件" || no "真实仓库被写脏"

# ═══ 组 ⑦ timeline 四源（D805）═══
echo "⑦ timeline 四源（first_commit 界 / dispatched / merged / audited）"
F7="$TMPD/timeline"; mkdir -p "$F7"
# — git 夹具：bulk 界前提交 + 界后提交 + squash merge 提交（日期全部定死，零平台差异）—
git -C "$F7" init -q 2>/dev/null || git -C "$F7" init -q
git -C "$F7" symbolic-ref HEAD refs/heads/main 2>/dev/null || true
G() { git -C "$F7" -c user.email=t@t -c user.name=t "$@"; }
mkdir -p "$F7/src/line1" "$F7/src/line2" "$F7/src/line3" "$F7/docs"
echo a > "$F7/src/line1/a.ts"; echo b > "$F7/src/line2/b.ts"
# bulk import（界前 2026-06-03，全目录一把进）
G add -A
GIT_AUTHOR_DATE="2026-06-03T10:00:00" GIT_COMMITTER_DATE="2026-06-03T10:00:00" \
  G commit -qm "SynovaAgent — 组织智能诊断独立仓库"
# 界后真实开发提交（线1 only）
echo a2 > "$F7/src/line1/a.ts"
G add -A
GIT_AUTHOR_DATE="2026-08-20T10:00:00" GIT_COMMITTER_DATE="2026-08-20T10:00:00" \
  G commit -qm "feat: 线1 界后开发"
# squash merge 提交 ×3（线1 subject 直连 / D300 行级链路 / 干扰项线10 不误归线1）
mkdir -p "$F7/blank"
G add -A
GIT_AUTHOR_DATE="2026-09-02T10:00:00" GIT_COMMITTER_DATE="2026-09-02T10:00:00" \
  G commit -qm "feat(D100): 线1桌面端修复 (#55)" --allow-empty
GIT_AUTHOR_DATE="2026-09-05T10:00:00" GIT_COMMITTER_DATE="2026-09-05T10:00:00" \
  G commit -qm "docs(D300): 哨兵复核派单 (#77)" --allow-empty
GIT_AUTHOR_DATE="2026-09-03T10:00:00" GIT_COMMITTER_DATE="2026-09-03T10:00:00" \
  G commit -qm "chore(D400): 线10 资本循环调整 (#88)" --allow-empty
# — 派单文档夹具 —
mkdir -p "$F7/docs/synova/coordination" "$F7/docs/synova/audit-reports" \
         "$F7/docs/synova/product-lines/evidence" "$F7/scripts/golden-scenarios/evidence" \
         "$F7/task-state" "$F7/docs/synova/project"
cat > "$F7/docs/synova/coordination/派单-D100-线1重验-20260901.md" <<'MD'
# 派单：线 1 重验批（D100）
线 1 桌面端证据重验，7 个点过期。
MD
cat > "$F7/docs/synova/coordination/派单-D300-20260904.md" <<'MD'
# 派单：复核批（D300）
| D# | 任务 |
|---|---|
| **D300** | 线 3 哨兵复核 |
MD
cat > "$F7/docs/synova/coordination/派单-D400-线10-20260903.md" <<'MD'
# 派单：线 10 资本循环（D400）
线 10 是第一条 100% 线候选。
MD
# — K3 报告夹具：D100（文件名日期）+ 头部声明线 3 —
cat > "$F7/docs/synova/audit-reports/2026-09-04-D100.md" <<'MD'
# K3 审计报告 — D100 线 1 重验
> 日期: 2026-09-04
## 结论: 🟢 PASS
MD
cat > "$F7/docs/synova/audit-reports/2026-09-07-D500-audit.md" <<'MD'
# K3 审计报告 — 线 3 哨兵全量复核
> 日期: 2026-09-07
## 结论: 🟢 PASS
MD
# — V1 断言表（3 线）+ yaml（modules 声明）—
cat > "$F7/docs/synova/project/$V1_NAME" <<'MD'
### 线1 桌面端
| ID | 断言（判定式） | verify | 证据 | fail_when |
|---|---|---|---|---|
| 1-1 | 甲 | v | scenario | x |

### 线2 对话
| ID | 断言（判定式） | verify | 证据 | fail_when |
|---|---|---|---|---|
| 2-1 | 丙 | v | scenario | x |

### 线3 哨兵
| ID | 断言（判定式） | verify | 证据 | fail_when |
|---|---|---|---|---|
| 3-1 | 戊 | v | scenario | x |
MD
cat > "$F7/docs/synova/product-lines/product-lines.yaml" <<'YML'
version: 1.0
lines:
  - id: 1
    name: "桌面端"
    done_definition: "d1"
    modules: ["src/line1"]
    acceptance_points:
      - id: "1-1"
        desc: "甲"
  - id: 2
    name: "对话"
    done_definition: "d2"
    modules: ["src/line2"]
    acceptance_points:
      - id: "2-1"
        desc: "丙"
  - id: 3
    name: "哨兵"
    done_definition: "d3"
    modules: ["src/line3"]
    acceptance_points:
      - id: "3-1"
        desc: "戊"
YML
OUT7="$TMPD/timeline.json"
run_sut "$F7" "$OUT7" >/dev/null 2>&1; RC7=$?
[ "$RC7" = "0" ] && ok "timeline 夹具 exit 0" || no "timeline 夹具 exit $RC7"
[ "$(jget "$OUT7" timeline | "$PYBIN" -c 'import json,sys;print(len(json.load(sys.stdin)))')" = "3" ] \
  && ok "timeline=3 行" || no "timeline 行数应 3"
# 线1: first_commit 界后（不是 bulk 2026-06-03）
[ "$(jget "$OUT7" timeline.0.actual.first_commit)" = "2026-08-20" ] \
  && ok "线1 first_commit=2026-08-20（界后首提交，非 bulk 2026-06-03）" \
  || no "线1 first_commit 应 2026-08-20，实 $(jget "$OUT7" timeline.0.actual.first_commit)"
[ "$(jget "$OUT7" timeline.0.actual.dispatched)" = "2026-09-01" ] \
  && ok "线1 dispatched=2026-09-01（最早派单文档文件名日期）" \
  || no "线1 dispatched 应 2026-09-01，实 $(jget "$OUT7" timeline.0.actual.dispatched)"
[ "$(jget "$OUT7" timeline.0.actual.merged)" = "2026-09-02" ] \
  && ok "线1 merged=2026-09-02（squash subject 直连 (#55)）" \
  || no "线1 merged 应 2026-09-02，实 $(jget "$OUT7" timeline.0.actual.merged)"
[ "$(jget "$OUT7" timeline.0.actual.audited)" = "2026-09-04" ] \
  && ok "线1 audited=2026-09-04（报告文件名日期，D100 链路）" \
  || no "线1 audited 应 2026-09-04，实 $(jget "$OUT7" timeline.0.actual.audited)"
# 线2: 反向——仅 bulk 历史 → first_commit=null + degraded_sources 登记（验收①）
[ "$(jget "$OUT7" timeline.1.actual.first_commit)" = "None" ] \
  && ok "线2 first_commit=null（仅 bulk 历史，禁显示 2026-06-03）" \
  || no "线2 first_commit 应 null，实 $(jget "$OUT7" timeline.1.actual.first_commit)"
[ "$(jget "$OUT7" timeline.1.actual.dispatched)" = "None" ] && ok "线2 dispatched=null（无派单引用）" || no "线2 dispatched 应 null"
[ "$(jget "$OUT7" timeline.1.actual.merged)" = "None" ]      && ok "线2 merged=null"                          || no "线2 merged 应 null"
[ "$(jget "$OUT7" timeline.1.actual.audited)" = "None" ]     && ok "线2 audited=null"                         || no "线2 audited 应 null"
[ "$(jget "$OUT7" degraded)" = "True" ] \
  && ok "线2 bulk 排除 → degraded=true（禁静默改口径）" || no "degraded 应 true，实 $(jget "$OUT7" degraded)"
grep -q "线2" "$OUT7" && grep -q "bulk" "$OUT7" \
  && ok "degraded_sources 点名「线2」+ bulk 语义" || no "degraded_sources 未登记线2 bulk 排除（静默）"
# 线3: 无任何 modules 历史 → null + 「无提交历史」登记（区别于 bulk 排除）
[ "$(jget "$OUT7" timeline.2.actual.first_commit)" = "None" ] \
  && ok "线3 first_commit=null（modules 无历史）" || no "线3 first_commit 应 null"
grep -q "线3" "$OUT7" \
  && ok "线3 无历史也显式登记（区别于 bulk）" || no "线3 未登记"
[ "$(jget "$OUT7" timeline.2.actual.dispatched)" = "2026-09-04" ] \
  && ok "线3 dispatched=2026-09-04（行级规则: 表格行 D300×线3）" \
  || no "线3 dispatched 应 2026-09-04，实 $(jget "$OUT7" timeline.2.actual.dispatched)"
[ "$(jget "$OUT7" timeline.2.actual.merged)" = "2026-09-05" ] \
  && ok "线3 merged=2026-09-05（行级 D300 → squash (#77)，subject 不含线3）" \
  || no "线3 merged 应 2026-09-05，实 $(jget "$OUT7" timeline.2.actual.merged)"
[ "$(jget "$OUT7" timeline.2.actual.audited)" = "2026-09-07" ] \
  && ok "线3 audited=2026-09-07（报告头部声明「线 3」源）" \
  || no "线3 audited 应 2026-09-07，实 $(jget "$OUT7" timeline.2.actual.audited)"
# 词边界: 线10 的派单/squash 不得误归线1/线2
[ "$(jget "$OUT7" timeline.1.actual.dispatched)" = "None" ] \
  && ok "词边界: 「线 10」文档不误归线2/线1" || no "词边界误归"
# milestone 未到位 → null + timeline_meta 显式标注
[ "$(jget "$OUT7" timeline.0.milestone)" = "None" ] && ok "线1 milestone=null（表未到位）" || no "milestone 应 null"
[ "$(jget "$OUT7" timeline.0.planned_week)" = "None" ] && ok "线1 planned_week=null" || no "planned_week 应 null"
[ "$(jget "$OUT7" timeline_meta.milestone_source)" = "not_available" ] \
  && ok "timeline_meta.milestone_source=not_available（显式标注）" || no "timeline_meta.milestone_source 错"
[ "$(jget "$OUT7" timeline_meta.bulk_boundary)" = "2026-08-16" ] \
  && ok "timeline_meta.bulk_boundary=2026-08-16（口径可核）" || no "bulk_boundary 错"
# 注入缝: 界改 2026-08-20（含当天）→ 线1 界后无提交 → null + degraded
OUT7B="$TMPD/timeline-b.json"
run_sut "$F7" "$OUT7B" --bulk-boundary 2026-08-20 >/dev/null 2>&1
[ "$(jget "$OUT7B" timeline.0.actual.first_commit)" = "None" ] \
  && ok "--bulk-boundary 注入: 界含当天 2026-08-20 → 线1 null（界日当天算界前）" \
  || no "注入界失败，实 $(jget "$OUT7B" timeline.0.actual.first_commit)"
grep -q "线1" "$OUT7B" && ok "注入界下线1 也显式登记" || no "注入界下线1 未登记"
# 非 git 夹具（组①的 F1 无 .git）→ timeline 四源全 null 不崩（既有行为保持）
[ "$(jget "$OUT1" timeline.0.actual.first_commit)" = "None" ] \
  && ok "非 git 夹具: first_commit=null 不崩" || no "非 git 夹具 first_commit 应 null"

echo
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] || exit 1
exit 0
