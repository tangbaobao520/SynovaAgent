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
V1_NAME="26线-V1验收标准-v0.2-20260917.md"   # D806 ①: 规格源收敛为一份（唯一 glob 候选）

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
  [ "$(jget "$OUT6" totals.v1_total)" = "128" ] && ok "真实仓库 v1_total=128（分母冻结，v0.2 §三）" \
    || no "真实仓库 v1_total 应 128，实 $(jget "$OUT6" totals.v1_total)"
  [ "$(jget "$OUT6" lines | "$PYBIN" -c 'import json,sys;print(len(json.load(sys.stdin)))')" = "26" ] \
    && ok "真实仓库 lines=26" || no "真实仓库 lines 应 26"
  # D848 附带修正（非本卡四条验收）：这两行读的是**真实仓库**的进度数字，会随看板推进而变；
  #   原期望值 36/22 已过期（product-lines.yaml 验收点 164→174；v1_passed 22→27 = D809 撤回三点
  #   已接线恢复 + v0.2 §三新增两点）。真值由 CTO 独立复算证实（25→27，与线10 1/6→6/6 同批）。
  #   仅更新期望值，断言强度不变（仍会抓住意外漂移）。
  [ "$(jget "$OUT6" totals.backlog_points)" = "46" ] && ok "真实仓库 backlog_points=46（174-128）" \
    || no "backlog_points 应 46，实 $(jget "$OUT6" totals.backlog_points)"
  # D809: 未接线三点必须判 pending_k3 且不计 passed（撤回生效的**真实仓库**读数）
  PW_REAL="$("$PYBIN" - "$OUT6" <<'PY'
import json,sys
d=json.load(open(sys.argv[1],encoding='utf-8'))
a={x['id']:x for l in d['lines'] for x in l['assertions']}
print(",".join("%s:%s:%s" % (k,a[k]['status'],a[k]['ok']) for k in ('20-3','20-5','22-1')),
      d['totals'].get('pending_k3'))
PY
)"
  [ "$PW_REAL" = "20-3:pending_k3:False,20-5:pending_k3:False,22-1:pending_k3:False 3" ] \
    && ok "真实仓库 20-3/20-5/22-1 = pending_k3 且不计 passed（pending_k3=3）" \
    || no "真实仓库三点撤回读数错: $PW_REAL"
  [ "$(jget "$OUT6" totals.v1_passed)" = "27" ] \
    && ok "真实仓库 v1_passed=27（D809 撤回三点已接线恢复 + v0.2 §三新增两点）" \
    || no "真实仓库 v1_passed 应 27，实 $(jget "$OUT6" totals.v1_passed)"
else
  no "真实仓库缺 V1 断言表 ${V1_NAME}（上游 D793/PR#608 未并入）"
fi
# 只读证明: 夹具与真实仓库均不得被写
[ ! -f "$REPO/docs/synova/project/ledger.json.tmp" ] && ok "未在真实仓库留临时文件" || no "真实仓库被写脏"

# ═══ 组 ⑦ 规格源唯一 + 冻证件逐字（D806 ①②）═══
echo "⑦ 规格源唯一 + 冻证件逐字（签字哈希复现 + 字节级全等）"
V7="$TMPD/v7.txt"
"$PYBIN" - "$REPO" >"$V7" 2>&1 <<'PY'
import glob, hashlib, io, os, re, sys
os.chdir(sys.argv[1])
def emit(cond, msg): print(("OK " if cond else "NO ") + msg)
cands = sorted(glob.glob("docs/synova/project/26线-V1验收标准*.md"))
emit(len(cands) == 1, "规格源唯一（glob 候选=%d: %s）" % (len(cands), cands[-1] if cands else "-"))
if not cands:
    sys.exit(0)
doc = io.open(cands[-1], encoding="utf-8").read()
emit("## §五 签字（创始人）" in doc, "唯一规格源含 §五 签字块")
signed = doc.split("## 附录 A", 1)[0]
h = hashlib.sha256((signed.split("## §五")[0].rstrip() + "\n").encode()).hexdigest()[:8]
emit(h == "c11841e6", "签字区 sha256[:8] 复现 == c11841e6（实 %s）" % h)
sec1 = signed.split("## §一")[1].split("## §二")[0]
F = {pt: (b, f) for _, pt, b, f in re.findall(
    r"^\|\s*(\d+)\s*\|\s*([0-9]+-[0-9]+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$", sec1, re.M)}
F["26-7"] = (re.search(r"^\|\s*14\s*\|\s*26（新）\s*\|\s*(.+?)\s*\|\s*$", signed, re.M).group(1), None)
ap = doc.split("## 附录 A", 1)[1]
# D809: kind 字符类补 `_`——pending_wiring 含下划线，漏掉会把该行静默丢弃并误报「冻证件不一致」
cells = {pt: (d, k, f) for pt, d, v, k, f in re.findall(
    r"^\| ([0-9]+-[0-9]+) \| (.+?) \| (.+?) \| ([a-z0-9_\-]+) \| (.+?) \|$", ap, re.M)}
bad = [pt for pt, (b, f) in F.items()
       if pt not in cells or cells[pt][0] != b or (f is not None and cells[pt][2] != f)]
emit(not bad, "冻证件 §一/§二 条文+fail_when 与落库表逐字节全等（%d/%d%s）"
     % (len(F) - len(bad), len(F), "" if not bad else " 差异: %s" % bad))
PY
while IFS= read -r line; do
  case "$line" in
    OK\ *) ok "${line#OK }" ;;
    NO\ *) no "${line#NO }" ;;
    *)     echo "    $line" ;;
  esac
done < "$V7"

# ═══ 组 ⑧ pending_wiring 语义（D809 · 假绿回退 / K3 D808 P0 B-02/B-05/B-06）═══
# 口径: 证据列 = pending_wiring 表示「点亮已撤回，等接线」——① 永不与任何证据配对（fail-closed，
#       即便存在 record_type=pending_wiring 的记录也不点亮）② 不计 v1_passed / 不进保鲜分桶
#       ③ 计入 totals.pending_k3 与 lines[].pending_k3，断言级 status=pending_k3
#       ④ 反向: 接线完成后把证据列改回 test → 下一轮派生自动恢复计分（不做不可逆删除）
echo "⑧ pending_wiring → pending_k3（不计 passed；fail-closed；反向可复原）"
F8="$TMPD/pending"
mkdir -p "$F8/task-state" "$F8/docs/synova/product-lines/evidence" "$F8/docs/synova/project" "$F8/scripts/golden-scenarios/evidence"
cat > "$F8/docs/synova/project/$V1_NAME" <<'MD'
### 线1 未接线撤回
- 价值: 夹具
- DoD: 夹具
- 底数: 0%
- V1 断言:
| ID | 断言（判定式） | verify | 证据 | fail_when |
|---|---|---|---|---|
| 1-1 | 已撤回但存量证据仍在 | v | pending_wiring | x |
| 1-2 | 正常计分点 | v | test | x |
| 1-3 | 撤回且无任何证据 | v | pending_wiring | x |
MD
cat > "$F8/docs/synova/product-lines/product-lines.yaml" <<'YML'
version: 1.0
lines:
  - id: 1
    name: "未接线撤回"
    done_definition: "夹具"
    acceptance_points:
      - id: "1-1"
        desc: "a"
      - id: "1-2"
        desc: "b"
      - id: "1-3"
        desc: "c"
YML
# 存量证据 = 假绿来源（test pass 在 1-1 上）；另造 pending_wiring 证据作 fail-closed 反例
mk_evidence "$F8/docs/synova/product-lines/evidence/ev-test-1-1.json" test           "$(dago 1)" 1-1
mk_evidence "$F8/docs/synova/product-lines/evidence/ev-test-1-2.json" test           "$(dago 1)" 1-2
mk_evidence "$F8/docs/synova/product-lines/evidence/ev-pw-1-1.json"   pending_wiring "$(dago 1)" 1-1
OUT8="$TMPD/pending.json"; run_sut "$F8" "$OUT8" >/dev/null 2>&1; RC8=$?
[ "$RC8" = "0" ] && ok "pending_wiring 夹具 exit 0（撤回不是降级）" || no "夹具 exit $RC8"
[ "$(jget "$OUT8" totals.v1_passed)" = "1" ] \
  && ok "撤回点不计 passed: v1_passed=1（仅 1-2；存量 test 证据不再点亮 1-1）" \
  || no "v1_passed 应 1，实 $(jget "$OUT8" totals.v1_passed)"
[ "$(jget "$OUT8" totals.pending_k3)" = "2" ] \
  && ok "pending_wiring 计为 pending_k3: totals.pending_k3=2" \
  || no "totals.pending_k3 应 2，实 $(jget "$OUT8" totals.pending_k3)"
[ "$(jget "$OUT8" lines.0.pending_k3)" = "2" ] \
  && ok "线级 pending_k3=2（看板可按线显示）" || no "lines.0.pending_k3 应 2，实 $(jget "$OUT8" lines.0.pending_k3)"
[ "$(jget "$OUT8" lines.0.assertions.0.status)" = "pending_k3" ] \
  && ok "1-1 status=pending_k3" || no "1-1 status 应 pending_k3，实 $(jget "$OUT8" lines.0.assertions.0.status)"
[ "$(jget "$OUT8" lines.0.assertions.0.ok)" = "False" ] \
  && ok "1-1 ok=false（fail-closed：伪造 record_type=pending_wiring 也点不亮）" \
  || no "1-1 ok 应 false，实 $(jget "$OUT8" lines.0.assertions.0.ok)"
[ "$(jget "$OUT8" lines.0.assertions.1.status)" = "passed" ] \
  && ok "1-2 status=passed（正常点不受影响）" || no "1-2 status 应 passed，实 $(jget "$OUT8" lines.0.assertions.1.status)"
[ "$(jget "$OUT8" lines.0.assertions.2.status)" = "pending_k3" ] \
  && ok "1-3 status=pending_k3（撤回但零证据 = 边界情形）" \
  || no "1-3 status 应 pending_k3，实 $(jget "$OUT8" lines.0.assertions.2.status)"
[ "$(jget "$OUT8" lines.0.assertions.0.freshness)" = "None" ] \
  && ok "撤回点不进保鲜分桶（freshness=null）" || no "撤回点 freshness 应 null，实 $(jget "$OUT8" lines.0.assertions.0.freshness)"
[ "$(jget "$OUT8" totals.freshness)" = '{"green": 1, "red": 0, "yellow": 0}' ] \
  && ok "保鲜只数通过点: green=1" || no "freshness 应 green1，实 $(jget "$OUT8" totals.freshness)"
[ "$(jget "$OUT8" totals.v1_verified)" = "0" ] \
  && ok "撤回点不计 verified（无 k3 复核）" || no "v1_verified 应 0，实 $(jget "$OUT8" totals.v1_verified)"
# 反向: 接线完成 → 证据列改回 test（python 改写，跨平台，不用 sed -i）
"$PYBIN" - "$F8/docs/synova/project/$V1_NAME" <<'PY'
import io,sys
p=sys.argv[1]; t=io.open(p,encoding='utf-8').read()
io.open(p,'w',encoding='utf-8').write(t.replace('| 1-1 | 已撤回但存量证据仍在 | v | pending_wiring | x |',
                                               '| 1-1 | 已撤回但存量证据仍在 | v | test | x |'))
PY
OUT8B="$TMPD/pending-reverse.json"; run_sut "$F8" "$OUT8B" >/dev/null 2>&1
[ "$(jget "$OUT8B" totals.v1_passed)" = "2" ] \
  && ok "反向: 1-1 改回 test → v1_passed 1→2（接线完成即复原，非不可逆删除）" \
  || no "反向 v1_passed 应 2，实 $(jget "$OUT8B" totals.v1_passed)"
[ "$(jget "$OUT8B" totals.pending_k3)" = "1" ] \
  && ok "反向: pending_k3 2→1（仅剩 1-3）" || no "反向 pending_k3 应 1，实 $(jget "$OUT8B" totals.pending_k3)"
[ "$(jget "$OUT8B" lines.0.assertions.0.status)" = "passed" ] \
  && ok "反向: 1-1 status=passed" || no "反向 1-1 status 应 passed，实 $(jget "$OUT8B" lines.0.assertions.0.status)"

# ═══ 组 ⑨ D811 未合 PR 队列旁路段（pr_queue）═══
# 口径: 队列指标是**旁路诊断物** —— ① 挂进账本供看板渲染，但**不参与**交付度分子分母
#       ② 快照缺失/损坏 → pr_queue=null + skipped_sources 登记，**不计 degraded**（不淹没真降级）
#       ③ 超限只出告警（stdout），**不改退出码**（DSH 决策镜头原则⑤：诊断不污染主路径）
echo "⑨ D811 pr_queue 旁路段（挂链 / 缺失不降级 / 超限只告警）"
F9="$TMPD/pq"; mkdir -p "$F9/task-state" "$F9/docs/synova/product-lines/evidence" \
  "$F9/docs/synova/project" "$F9/scripts/golden-scenarios/evidence"
cp "$F1/docs/synova/project/$V1_NAME" "$F9/docs/synova/project/$V1_NAME"
cp "$F1/docs/synova/product-lines/product-lines.yaml" "$F9/docs/synova/product-lines/product-lines.yaml"
cp "$F1/docs/synova/product-lines/evidence/"*.json "$F9/docs/synova/product-lines/evidence/" 2>/dev/null || true
# 无快照 → null + skipped，不计 degraded
OUT9A="$TMPD/pq-missing.json"; run_sut "$F9" "$OUT9A" >/dev/null 2>&1
[ "$(jget "$OUT9A" pr_queue)" = "None" ] && ok "无快照 → pr_queue=null（不臆造 0）" \
  || no "pr_queue 应 null，实 $(jget "$OUT9A" pr_queue)"
[ "$(jget "$OUT9A" degraded)" = "False" ] && ok "缺旁路快照**不计** degraded（不淹没真降级）" \
  || no "旁路缺失误判 degraded"
"$PYBIN" -c "import json,sys;d=json.load(open(sys.argv[1],encoding='utf-8'));sys.exit(0 if any('pr_queue' in s for s in d['skipped_sources']) else 1)" "$OUT9A" \
  && ok "缺快照显式进 skipped_sources（不静默）" || no "skipped_sources 未登记 pr_queue"
# 坏快照 → null + skipped
printf '{ not json' > "$F9/docs/synova/project/pr-queue.json"
OUT9B="$TMPD/pq-corrupt.json"; run_sut "$F9" "$OUT9B" >/dev/null 2>&1
[ "$(jget "$OUT9B" pr_queue)" = "None" ] && ok "坏快照 → pr_queue=null" || no "坏快照应置空"
[ "$(jget "$OUT9B" degraded)" = "False" ] && ok "坏旁路快照仍不计 degraded" || no "坏旁路快照误判 degraded"
# 超限夹具（13 > 12）→ 指标挂上 + stdout 告警 + 退出码 0
"$PYBIN" - "$F9/docs/synova/project/pr-queue.json" <<'PY'
import json,sys
recs=[{"number":900+i,"title":"夹具 %d"%i,"age_days":10+i,"behind":i*20,
       "closeable":i<3,"close_reasons":["CI_RED_LONG"] if i<3 else []} for i in range(13)]
json.dump({"schema":"pr-queue-snapshot/1","generated_at":"2026-09-20T00:00:00+08:00",
           "limit":12,"degraded":False,"degraded_sources":[],"records":recs,
           "metrics":{"queue_length":13,"limit":12,"over_limit":True,
                      "oldest":{"number":900,"age_days":10},
                      "behind_distribution":{"0":1,"1-5":0,"6-20":0,"21-100":0,"100+":12,"unknown":0},
                      "behind_unknown":0,"ci_distribution":{"success":13,"failure":0,"pending":0,"none":0,"unknown":0},
                      "closeable_count":3,"orphan_count":0,"owner_conflicts":2,"by_reason":{"CI_RED_LONG":3}},
           "warning":"⚠️ 未合 PR 队列超限：13 > 12 —— 先退役再开新 PR（夹具）"},
          open(sys.argv[1],"w",encoding="utf-8"),ensure_ascii=False,indent=1)
PY
OUT9C="$TMPD/pq-over.json"; run_sut "$F9" "$OUT9C" > "$TMPD/pq-out.txt" 2>/dev/null; RC=$?  # swallow-ok: 本组只验 stdout 告警文案，派生器 stderr 的 degraded 日志已在组③单独断言
[ "$RC" = "0" ] && ok "超限时派生器退出码仍 0（只告警不阻断主路径）" || no "超限不应改退出码，实 $RC"
[ "$(jget "$OUT9C" pr_queue.queue_length)" = "13" ] && ok "队列长度挂进账本" || no "queue_length 未挂链"
[ "$(jget "$OUT9C" pr_queue.oldest.age_days)" = "10" ] && ok "最老 PR 年龄挂进账本" || no "oldest 未挂链"
[ "$(jget "$OUT9C" pr_queue.behind_distribution.100+)" = "12" ] && ok "behind 分布挂进账本" || no "behind 分布未挂链"
[ "$(jget "$OUT9C" pr_queue.closeable_count)" = "3" ] && ok "可关计数挂进账本" || no "closeable_count 未挂链"
[ "$(jget "$OUT9C" pr_queue.over_limit)" = "True" ] && ok "超限标记挂进账本" || no "over_limit 未挂链"
grep -q "先退役再开新 PR" "$TMPD/pq-out.txt" && ok "超限告警出现在派生器 stdout" || no "stdout 未见告警"
# 旁路不参与交付度：同一夹具下 v1_passed 与无快照时一致
[ "$(jget "$OUT9C" totals.v1_passed)" = "$(jget "$OUT9A" totals.v1_passed)" ] \
  && ok "旁路段不改交付度分子（13 条超限 PR 不影响 v1_passed）" || no "旁路段污染了交付度"

check_sut() { # check_sut <fixture-root> <out-file> [extra args...]（D848 --check，捕获输出 + 退出码）
  local root="$1" out="$2"; shift 2
  "$PYBIN" "$SUT" --repo-root "$root" --out "$out" --today "$TODAY" --check "$@" 2>/dev/null
}

# ═══ 组 ⑩（D848）账本漂移门禁 --check: 先红 / 后绿 / 旁路不误伤 / 只读 / 时间相对豁免 ═══
# 背景（K3 D815 P1）: main 的 ledger 停留在线10=1/6 而 D803 证据已合入 → "证据已合、账本没动"
#   无人报警，派单背景数字靠人转述。本组锁死: 漂移必红 / 无证据变更不红 / 无法对账 fail-closed。
echo "── 组 ⑩（D848）: 账本漂移门禁（--check）──"
F10="$TMPD/f10"; build_fixture "$F10"
LED10="$F10/docs/synova/project/ledger.json"
run_sut "$F10" "$LED10" >/dev/null 2>&1 || true      # 基线: 派生一次，盘上账本与真相一致
cp "$LED10" "$TMPD/led10.snapshot.json"

O10=$(check_sut "$F10" "$LED10"); R10=$?
[ "$R10" = "0" ] && ok "⑩-1 一致 → exit 0（正常路径）" || no "⑩-1 应 exit 0，实 $R10"
echo "$O10" | grep -q "一致" && ok "⑩-1 输出显式报一致" || no "⑩-1 输出未报一致: $O10"

# ⑩-2 **先红**: 新证据把 2-2 点亮，但**不重算**账本 → 门禁必须红（K3 D815 P1 的同形）
mk_evidence "$F10/docs/synova/product-lines/evidence/GS-FRESH.json" founder-demo "$TODAY" "2-2" pass
O10R=$(check_sut "$F10" "$LED10"); R10R=$?
[ "$R10R" = "1" ] && ok "⑩-2 证据已合未重算 → exit 1（先红）" || no "⑩-2 应 exit 1，实 $R10R"
echo "$O10R" | grep -q "漂移" && ok "⑩-2 输出点名漂移" || no "⑩-2 未报漂移: $O10R"
echo "$O10R" | grep -q "lines/1/assertions/1/status" \
  && ok "⑩-2 差异定位到 line2/断言2 的 status（不是笼统报错）" \
  || no "⑩-2 差异未定位到断言级: $O10R"
echo "$O10R" | grep -q "gen-project-board.py --out" && ok "⑩-2 给一步可执行重算命令" || no "⑩-2 缺重算命令"

# ⑩-3 **后绿**: 重算一次再查 → 一致
run_sut "$F10" "$LED10" >/dev/null 2>&1 || true
O10G=$(check_sut "$F10" "$LED10"); R10G=$?
[ "$R10G" = "0" ] && ok "⑩-3 重算后 → exit 0（后绿）" || no "⑩-3 重算后仍红，实 $R10G"

# ⑩-4 **反向（防误伤）**: 变更集不含证据/标准类路径 → 跳过（exit 0，不压主路径）
O10S=$(check_sut "$F10" "$LED10" --changed-files "scripts/project/gen-project-board.py,docs/research/a.md"); R10S=$?
[ "$R10S" = "0" ] && ok "⑩-4 普通变更不触发（exit 0）" || no "⑩-4 普通变更误红，实 $R10S"
echo "$O10S" | grep -q "^skip" && ok "⑩-4 显式 skip（不静默）" || no "⑩-4 未显式 skip: $O10S"

# ⑩-5 证据类变更 → 门禁确实接管（同一漂移状态下 exit 1）
mk_evidence "$F10/docs/synova/product-lines/evidence/GS-FRESH2.json" founder-demo "$TODAY" "2-2" pass
O10T=$(check_sut "$F10" "$LED10" --changed-files "docs/synova/product-lines/evidence/GS-FRESH2.json"); R10T=$?
[ "$R10T" = "1" ] && ok "⑩-5 证据类路径变更触发对账（exit 1）" || no "⑩-5 证据类变更未触发，实 $R10T"

# ⑩-6 边界: 账本缺失 → exit 2 + 显式点名（绝不当成"一致"静默放行，铁律 24/31）
O10M=$(check_sut "$F10" "$TMPD/nonexistent/ledger.json"); R10M=$?
[ "$R10M" = "2" ] && ok "⑩-6 账本缺失 → exit 2（fail-closed，不与通过混同）" || no "⑩-6 应 exit 2，实 $R10M"
echo "$O10M" | grep -q "无法对账" && ok "⑩-6 显式报无法对账（不静默）" || no "⑩-6 未显式点名: $O10M"

# ⑩-7 只读保证: --check 前后盘上账本逐字节不变（写在盘前返回；不作任何副作用）
_hash10() { "$PYBIN" -c "import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest())" "$1"; }
_h10a="$(_hash10 "$LED10")"
check_sut "$F10" "$LED10" >/dev/null; check_sut "$F10" "$LED10" --changed-files "docs/synova/product-lines/evidence/GS-FRESH2.json" >/dev/null
[ "$_h10a" = "$(_hash10 "$LED10")" ] \
  && ok "⑩-7 --check 全程只读（盘上账本指纹未变）" || no "⑩-7 --check 改动了盘上账本"

# ⑩-8 时间相对豁免（防隔夜误报）: 用「今天=生成日」的账本，在 8 天后对账 → 仍一致
#   （freshness 桶 / age_days / blocked.days 随日期变化，纳入判定会让任何隔夜账本误红）
run_sut "$F10" "$LED10" >/dev/null 2>&1 || true
O10D=$("$PYBIN" "$SUT" --repo-root "$F10" --out "$LED10" --today "2026-09-25" --check 2>/dev/null); R10D=$?
[ "$R10D" = "0" ] && ok "⑩-8 8 天后对账仍一致（时间相对字段已豁免）" || no "⑩-8 隔夜误红，实 $R10D"

echo
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] || exit 1
exit 0
