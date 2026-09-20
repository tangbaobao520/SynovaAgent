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
#   ① 正常路径 — 手算数字对账（点亮/独立核验/保鲜/backlog/两处证据来源/三档）
#   ② 反向     — 删证据 → 该断言 ok 由 true 回退 false（证明非硬编码）
#   ③ 降级     — 缺 yaml / 坏 JSON → degraded:true + degraded_sources 非空 + 退出码契约
#   ④ 保鲜边界 — 7 天=🟢 / 8 天=🟡 / 14 天=🟡 / 15 天=🔴，且**不扣点亮数**（口径红线）
#   ⑤ 幂等     — 连跑两次，除 generated_at/git_head 外逐键相等
#   ⑥ 真实仓库 — 只读冒烟: **只断言不变量与跨源自洽**（CT-67 修复），具体数值见组①/④/⑧/⑩
#   ⑩ 三档口径 — D850: 恒等式闭合 / null+原因（禁猜 0）/ 每档 evidence_cmd 非空且实跑对账
#
# D850 口径变更（创始人 2026-09-20 裁定；权威 `docs/authority/产品完成度定义与推进总纲-20260918.md` §1.2
# + `docs/synova/coordination/验收标准-穿真实入口-v1-20260918.md` §二）:
#   totals 不再有 delivery_pct / verify_pct；改 totals.buckets 三档离散计数（每档带可复现命令）
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
[ "$(jget "$OUT1" totals.delivery_pct)" = "None" ] && ok "totals 无 delivery_pct（百分比口径已取消）" || no "delivery_pct 仍在: $(jget "$OUT1" totals.delivery_pct)"
[ "$(jget "$OUT1" totals.verify_pct)" = "None" ]   && ok "totals 无 verify_pct" || no "verify_pct 仍在: $(jget "$OUT1" totals.verify_pct)"
# D850 三档（夹具手算: 点亮 3 [1-1 scenario, 1-2 k3, 2-1 test] / 独立核验 1 [1-2] / 撤回 0 /
# 未判定 1 [2-2 声明的 founder-demo 无匹配证据]）；夹具数值是**密封**的，不随真实仓库漂移
[ "$(jget "$OUT1" totals.buckets.healthy.count)" = "1" ] \
  && ok "三档 healthy=1（点亮且另有 k3 独立 PASS）" || no "healthy 应 1，实 $(jget "$OUT1" totals.buckets.healthy.count)"
[ "$(jget "$OUT1" totals.buckets.written_not_wired.count)" = "0" ] \
  && ok "三档 written_not_wired=0" || no "written_not_wired 应 0，实 $(jget "$OUT1" totals.buckets.written_not_wired.count)"
[ "$(jget "$OUT1" totals.buckets.missing.count)" = "None" ] \
  && ok "三档 missing=null（无机器可读判定源 → 禁猜 0）" || no "missing 应 null，实 $(jget "$OUT1" totals.buckets.missing.count)"
[ "$(jget "$OUT1" totals.buckets.other_states.live_unverified.count)" = "2" ] \
  && ok "其它态 live_unverified=2（点亮但无独立核验 = 能跑未验证）" || no "live_unverified 应 2，实 $(jget "$OUT1" totals.buckets.other_states.live_unverified.count)"
[ "$(jget "$OUT1" totals.buckets.other_states.wired_broken.count)" = "None" ] \
  && ok "其它态 wired_broken=null（需冒烟启动，无源）" || no "wired_broken 应 null，实 $(jget "$OUT1" totals.buckets.other_states.wired_broken.count)"
[ "$(jget "$OUT1" totals.buckets.other_states.state_unknown.count)" = "1" ] \
  && ok "残余 state_unknown=1（未点亮且非撤回 → 归属不可判定，显式列出不丢点）" || no "state_unknown 应 1，实 $(jget "$OUT1" totals.buckets.other_states.state_unknown.count)"
[ "$(jget "$OUT1" totals.buckets.identity.holds)" = "True" ] \
  && ok "三档恒等式闭合：各档之和 + 显式其它态 = v1_total(4)" || no "恒等式未闭合: $(jget "$OUT1" totals.buckets.identity)"
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
[ "$(jget "$OUT4" totals.v1_passed)" = "4" ] && ok "🟡🔴 仍计点亮数: v1_passed=4（口径红线：保鲜不扣点亮）" \
  || no "过期证据被扣点亮数，违反 09-17 口径（实 v1_passed=$(jget "$OUT4" totals.v1_passed)）"
[ "$(jget "$OUT4" totals.delivery_pct)" = "None" ] && ok "组④ 亦无 delivery_pct（口径单源，不留后门）" || no "delivery_pct 仍在"
[ "$(jget "$OUT4" totals.buckets.other_states.live_unverified.count)" = "4" ] \
  && ok "保鲜边界夹具三档: live_unverified=4（4 点全为 scenario 点亮，无 k3 独立核验）" \
  || no "live_unverified 应 4，实 $(jget "$OUT4" totals.buckets.other_states.live_unverified.count)"
[ "$(jget "$OUT4" totals.buckets.healthy.count)" = "0" ] \
  && ok "保鲜边界夹具三档: healthy=0（无独立核验 → 不冒充健康）" || no "healthy 应 0，实 $(jget "$OUT4" totals.buckets.healthy.count)"
[ "$(jget "$OUT4" totals.buckets.identity.holds)" = "True" ] && ok "组④ 恒等式闭合" || no "组④ 恒等式未闭合"

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
# 原实现为反条件断言（`|| ok`：相等时才计数 → 「通过」的判据与文案相反，且同秒运行会让总数漂移 116/117）。
# 改为无条件计数 + 事实陈述：generated_at 是幂等豁免字段，相同或不同都合规。
if [ "$(jget "$IA" generated_at)" != "$(jget "$IB" generated_at)" ]; then
  ok "generated_at 随运行变化（幂等豁免契约：该字段允许不同）"
else
  ok "两次运行 generated_at 相同（同一秒内运行，豁免字段本就允许相同）"
fi

# ═══ 组 ⑥ 真实仓库冒烟（只读，输出到临时文件）═══
# CT-67 修复（2026-09-20, D850）：本组**只断言不变量与跨源自洽**，不再写死 live 数值
#   （旧版写死 backlog_points=36 / v1_passed=22 / lines=26 → 仓库数据一变即假红）。
#   具体数值留给**密封夹具组**（①/④/⑧/⑩）与组⑩ 的 evidence_cmd 独立复算对账。
echo "⑥ 真实仓库冒烟（只读；不变量 + 跨源自洽）"
V1_REAL="$REPO/docs/synova/project/$V1_NAME"
if [ -f "$V1_REAL" ]; then
  OUT6="$TMPD/real.json"
  run_sut "$REPO" "$OUT6" >/dev/null 2>&1; RC6=$?
  [ "$RC6" = "0" ] && ok "真实仓库 exit 0" || no "真实仓库 exit $RC6"
  # 128 = **冻结分母**（v0.2 §三 变更单），不是 live 数据；漂移时派生器自身已告警（FROZEN_V1_TOTAL）
  [ "$(jget "$OUT6" totals.v1_total)" = "128" ] && ok "真实仓库 v1_total=128（冻结分母，非 live 数据；v0.2 §三）" \
    || no "真实仓库 v1_total 应 128（冻结分母），实 $(jget "$OUT6" totals.v1_total)"
  INV6="$("$PYBIN" - "$OUT6" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8')); t = d['totals']
bad = []
if not isinstance(t.get('v1_passed'), int) or t['v1_passed'] < 0: bad.append('v1_passed 非法: %r' % (t.get('v1_passed'),))
elif t['v1_passed'] > t['v1_total']: bad.append('v1_passed > v1_total')
if not isinstance(t.get('v1_verified'), int) or t['v1_verified'] < 0: bad.append('v1_verified 非法')
elif isinstance(t.get('v1_passed'), int) and t['v1_verified'] > t['v1_passed']: bad.append('v1_verified > v1_passed')
if not isinstance(t.get('pending_k3'), int) or t['pending_k3'] < 0: bad.append('pending_k3 非法')
if not isinstance(t.get('backlog_points'), int) or t['backlog_points'] < 0: bad.append('backlog_points 非法: %r' % (t.get('backlog_points'),))
if len(d.get('lines') or []) < 1: bad.append('lines 为空')
for k in ('delivery_pct', 'verify_pct', 'product_progress_pct'):
    if k in t: bad.append('百分比字段仍在 totals: ' + k)
if not isinstance(d.get('degraded'), bool): bad.append('degraded 非布尔')
print('OK' if not bad else ' | '.join(bad))
PY
)"
  [ "$INV6" = "OK" ] && ok "组⑥ 不变量: 0≤v1_passed≤v1_total / v1_verified≤v1_passed / pending_k3,backlog_points≥0 / lines≥1 / 无百分比字段" \
    || no "组⑥ 不变量被破坏: $INV6"
  # 跨源自洽（独立于 SUT 重解析 V1 表 + yaml）: 撤回行数 == pending_k3、撤回点判 pending_k3/ok=false、
  # backlog_points == 独立解析的 yaml 验收点总数 − v1_total。**不写死任何具体数值**。
  XCHK6="$("$PYBIN" - "$REPO" "$OUT6" <<'PY'
import glob, importlib.util, json, re, sys
repo, out = sys.argv[1], sys.argv[2]
d = json.load(open(out, encoding='utf-8')); t = d['totals']
bad = []
p = sorted(glob.glob(repo + '/docs/synova/project/26线-V1验收标准*.md'))[-1]
rows = [[c.strip() for c in l.strip().strip('|').split('|')]
        for l in open(p, encoding='utf-8') if re.match(r'^\|\s*\d+-\d+\s*\|', l)]
pw = {r[0] for r in rows if len(r) >= 5 and r[3] == 'pending_wiring'}
if len(pw) != t.get('pending_k3'):
    bad.append('V1 表撤回行数 %d ≠ totals.pending_k3 %r' % (len(pw), t.get('pending_k3')))
a = {x['id']: x for l in d['lines'] for x in l['assertions']}
for pid in sorted(pw):
    if pid not in a:
        bad.append('撤回点未出现在账本: ' + pid)
    elif a[pid]['status'] != 'pending_k3' or a[pid]['ok'] is not False:
        bad.append('%s 应 pending_k3/ok=false，实 %s/%s' % (pid, a[pid]['status'], a[pid]['ok']))
spec = importlib.util.spec_from_file_location('ply', repo + '/scripts/product-lines/productline_yaml.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
y = m.load_file(repo + '/docs/synova/product-lines/product-lines.yaml')
pts = sum(len(ln.get('acceptance_points') or []) for ln in y['lines'])
if pts - t.get('v1_total') != t.get('backlog_points'):
    bad.append('backlog_points %r ≠ yaml 点数 %d − v1_total %r' % (t.get('backlog_points'), pts, t.get('v1_total')))
if len(a) != t.get('v1_total'):
    bad.append('账本断言数 %d ≠ v1_total %r' % (len(a), t.get('v1_total')))
print('OK' if not bad else ' | '.join(bad))
PY
)"
  [ "$XCHK6" = "OK" ] && ok "组⑥ 跨源自洽: 撤回行数↔pending_k3 / 撤回点↔账本 status / backlog_points↔yaml 点数 / 断言数↔v1_total" \
    || no "组⑥ 跨源自洽失败: $XCHK6"
  [ "$(jget "$OUT6" totals.buckets.identity.holds)" = "True" ] \
    && ok "真实仓库三档恒等式闭合（分母 $(jget "$OUT6" totals.v1_total)）" || no "真实仓库恒等式未闭合"
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

# ═══ 组 ⑩ D850 离散三档口径（恒等式 / 互斥完备 / null+原因 / evidence_cmd 实跑对账）═══
# 权威:
#   `docs/authority/产品完成度定义与推进总纲-20260918.md` §1.2（五态定义 + 「N 个健康 / M 个写了没接 /
#   K 个缺 —— 离散计数，不是百分比」）+ `docs/synova/coordination/验收标准-穿真实入口-v1-20260918.md` §二
#   + `/Users/wane/山河研究院/99-综合/方案-项目度量-从声明驱动到事实驱动.md` §四（「每个数字必须带一条
#   可复现的命令。不能复现的数字，不上看板」）/ §六（静态检测实测 3/5=60%，只能粗筛不能当判定源）
# 口径（三档 = 五态的报告折叠；互斥且完备；无法判定显式 null + 原因，禁猜 0）:
#   healthy            ← 点亮且另有 record_type=k3 的独立 PASS 裁决（「独立核验通过」口径）
#   written_not_wired  ← V1 断言表「证据」列 = pending_wiring（D809 撤回标记 = 有实现未接线）
#   missing            ← 总纲「缺」；判定手段 = 代码检索（本卡明令禁 grep 型静态判据）→ **null + 原因**
#   其它态（显式列出，不丢点）: live_unverified（能跑未验证）/ wired_broken（接了跑不通 → null）
#   state_unknown      ← 残余（未点亮且非撤回；五态归属不可判定）——显式列出以闭合恒等式
echo "⑩ D850 三档（恒等式 / null+原因 / evidence_cmd 逐条实跑）"
# ── ⑩-a 撤回夹具（F8: 1-1 撤回含存量证据 / 1-2 正常 / 1-3 撤回零证据）──
[ "$(jget "$OUT8" totals.buckets.written_not_wired.count)" = "2" ] \
  && ok "⑩ 撤回夹具 written_not_wired=2（V1 表 pending_wiring 行数，与存量 test 证据无关）" \
  || no "written_not_wired 应 2，实 $(jget "$OUT8" totals.buckets.written_not_wired.count)"
[ "$(jget "$OUT8" totals.buckets.healthy.count)" = "0" ] \
  && ok "⑩ 撤回夹具 healthy=0（撤回点不冒充健康）" || no "healthy 应 0，实 $(jget "$OUT8" totals.buckets.healthy.count)"
[ "$(jget "$OUT8" totals.buckets.other_states.live_unverified.count)" = "1" ] \
  && ok "⑩ 撤回夹具 live_unverified=1（仅 1-2 点亮无独立核验）" || no "live_unverified 应 1"
[ "$(jget "$OUT8" totals.buckets.other_states.state_unknown.count)" = "0" ] \
  && ok "⑩ 撤回夹具 state_unknown=0（3 点全部归入可判定态）" || no "state_unknown 应 0"
[ "$(jget "$OUT8" totals.buckets.identity.holds)" = "True" ] \
  && ok "⑩ 撤回夹具恒等式闭合 0+2+1+0=3" || no "恒等式未闭合"
# ⑧ 之后夹具已被「反向」改回 test（接线完成）→ OUT8B 的三档必须随源变化（证明非硬编码）
[ "$(jget "$OUT8B" totals.buckets.written_not_wired.count)" = "1" ] \
  && ok "⑩ 反向夹具 written_not_wired 2→1（撤回列改回 test 即随源变化，非硬编码）" \
  || no "反向 written_not_wired 应 1，实 $(jget "$OUT8B" totals.buckets.written_not_wired.count)"
[ "$(jget "$OUT8B" totals.buckets.other_states.live_unverified.count)" = "2" ] \
  && ok "⑩ 反向夹具 live_unverified 1→2（1-1 恢复点亮，仍无 k3 独立核验 → 不并进健康）" \
  || no "反向 live_unverified 应 2，实 $(jget "$OUT8B" totals.buckets.other_states.live_unverified.count)"
[ "$(jget "$OUT8B" totals.buckets.healthy.count)" = "0" ] \
  && ok "⑩ 反向夹具 healthy=0（点亮 ≠ 健康：无独立核验仍不冒充）" || no "反向 healthy 应 0"
# ── ⑩-b 结构口径（互斥完备 / null+原因 / 零百分比 / 分母=点集）──
BKT10="$("$PYBIN" - "$OUT8" "$OUT1" <<'PY'
import json, sys
bad = []
for path in sys.argv[1:]:
    d = json.load(open(path, encoding='utf-8')); b = d['totals']['buckets']; t = d['totals']
    tag = path.rsplit('/', 1)[-1]
    # ① 三档名字恰好正确（互斥档不含其它档）
    if set(b) & {'healthy', 'written_not_wired', 'missing'} != {'healthy', 'written_not_wired', 'missing'}:
        bad.append(tag + ': 缺三档之一')
    # ② 每个可判定档的 count 是 int；每个不可判定档的 count 必须**是 null**（禁猜 0）且 reason 非空
    for k in ('healthy', 'written_not_wired', 'missing'):
        e = b[k]
        if not isinstance(e.get('evidence_cmd'), str) or not e['evidence_cmd'].strip():
            bad.append('%s/%s: evidence_cmd 空' % (tag, k))
        c = e.get('count')
        if c is None:
            if not (e.get('reason') or '').strip(): bad.append('%s/%s: null 却无 reason' % (tag, k))
        elif not isinstance(c, int):
            bad.append('%s/%s: count 非 int/null: %r' % (tag, k, c))
    for k in ('live_unverified', 'wired_broken', 'state_unknown'):
        e = b['other_states'][k]
        if not isinstance(e.get('evidence_cmd'), str) or not e['evidence_cmd'].strip():
            bad.append('%s/other_states.%s: evidence_cmd 空' % (tag, k))
        if e.get('count') is None and not (e.get('reason') or '').strip():
            bad.append('%s/other_states.%s: null 却无 reason' % (tag, k))
    # ③ 恒等式: 各档之和 + 显式其它态 = v1_total（null 项不参与求和，但必须显式登记在 null_terms）
    terms = {'healthy': b['healthy']['count'], 'written_not_wired': b['written_not_wired']['count'],
             'missing': b['missing']['count'],
             'wired_broken': b['other_states']['wired_broken']['count'],
             'live_unverified': b['other_states']['live_unverified']['count'],
             'state_unknown': b['other_states']['state_unknown']['count']}
    known = sum(v for v in terms.values() if v is not None)
    if known != t['v1_total']:
        bad.append('%s: 已知项之和 %d ≠ v1_total %r' % (tag, known, t['v1_total']))
    if sorted(terms) != sorted(b['identity']['terms']):
        bad.append(tag + ': identity.terms 未列全五个态+残余')
    if sorted(x for x, v in terms.items() if v is None) != sorted(b['identity']['null_terms']):
        bad.append(tag + ': identity.null_terms 与实测 null 档不一致')
    if b['identity']['holds'] is not True:
        bad.append(tag + ': identity.holds 非 True')
    # ④ 零百分比: 三档结构内不得出现 *_pct 键；totals 不得有百分比字段
    def keys(x):
        if isinstance(x, dict):
            for k, v in x.items():
                yield k
                for kk in keys(v): yield kk
        elif isinstance(x, list):
            for v in x:
                for kk in keys(v): yield kk
    pct = [k for k in keys(b) if k.endswith('_pct')]
    if pct: bad.append('%s: 三档结构内出现百分比键 %s' % (tag, pct))
    for k in ('delivery_pct', 'verify_pct', 'product_progress_pct'):
        if k in t: bad.append('%s: totals 仍有 %s' % (tag, k))
    # ⑤ 权威件全名 + 版本必须写在结构里（引用纪律）
    if '产品完成度定义与推进总纲-20260918' not in json.dumps(b, ensure_ascii=False):
        bad.append(tag + ': buckets 未写权威件全名')
print('OK' if not bad else ' | '.join(bad))
PY
)"
[ "$BKT10" = "OK" ] && ok "⑩ 结构: 三档齐全 / 不可判定档 null+reason / 恒等式五态+残余列全 / 零百分比 / 权威件全名" \
  || no "⑩ 结构口径失败: $BKT10"
# ── ⑩-c evidence_cmd 逐条实跑（密封夹具 cwd）并与账本数字对账 ──
# 注意: 组⑧ 的「反向」步已把 $F8 夹具的 1-1 从 pending_wiring 改回 test →
#       evidence_cmd 反映**当前**夹具状态，故与它同态对账的账本是 $OUT8B（不是 $OUT8）
ev_get() { jget "$1" "totals.buckets.$2${3:-.count}"; }
ev_run() { ( cd "$1" && bash -c "$2" 2>&1 ); }
EV_FAIL=""
for pair in "healthy:healthy" "written_not_wired:written_not_wired" "other_states.live_unverified:live_unverified" "other_states.state_unknown:state_unknown"; do
  jp="${pair%%:*}"; field="${pair##*:}"
  CMD="$(ev_get "$OUT8B" "$jp" ".evidence_cmd")"
  [ -n "$CMD" ] || { EV_FAIL="$EV_FAIL $field:cmd空"; continue; }
  GOT="$(ev_run "$F8" "$CMD")"
  WANT="${field}=$(ev_get "$OUT8B" "$jp")"
  [ "$GOT" = "$WANT" ] || EV_FAIL="$EV_FAIL $field:期望[$WANT]实得[$GOT]"
done
for pair in "missing:implemented" "other_states.wired_broken:wired"; do
  jp="${pair%%:*}"; field="${pair##*:}"
  CMD="$(ev_get "$OUT8B" "$jp" ".evidence_cmd")"
  [ -n "$CMD" ] || { EV_FAIL="$EV_FAIL $field:cmd空"; continue; }
  GOT="$(ev_run "$F8" "$CMD")"
  [ "$GOT" = "${field}=SOURCE_ABSENT" ] || EV_FAIL="$EV_FAIL $field:期望判定源缺席实得[$GOT]"
done
[ -z "$EV_FAIL" ] && ok "⑩ 夹具: 六档 evidence_cmd 逐条实跑 exit 0 且与账本数字逐一对账一致" \
  || no "⑩ 夹具 evidence_cmd 实跑对账失败:$EV_FAIL"
# ── ⑩-d 真实仓库 evidence_cmd 逐条实跑（只读）与 ledger 对账；**不写死 live 数值** ──
EV_REAL_FAIL=""
if [ -f "$OUT6" ]; then
  for pair in "healthy:healthy" "written_not_wired:written_not_wired" "other_states.live_unverified:live_unverified" "other_states.state_unknown:state_unknown"; do
    jp="${pair%%:*}"; field="${pair##*:}"
    CMD="$(ev_get "$OUT6" "$jp" ".evidence_cmd")"
    GOT="$(ev_run "$REPO" "$CMD")"
    WANT="${field}=$(ev_get "$OUT6" "$jp")"
    [ "$GOT" = "$WANT" ] || EV_REAL_FAIL="$EV_REAL_FAIL $field:期望[$WANT]实得[$GOT]"
  done
  for pair in "missing:implemented" "other_states.wired_broken:wired"; do
    jp="${pair%%:*}"; field="${pair##*:}"
    CMD="$(ev_get "$OUT6" "$jp" ".evidence_cmd")"
    GOT="$(ev_run "$REPO" "$CMD")"
    [ "$GOT" = "${field}=SOURCE_ABSENT" ] || EV_REAL_FAIL="$EV_REAL_FAIL $field:[$GOT]"
  done
  [ -z "$EV_REAL_FAIL" ] && ok "⑩ 真实仓库: 六档 evidence_cmd 独立复算 == ledger 数字（源侧复算，非读回派生值）" \
    || no "⑩ 真实仓库 evidence_cmd 对账失败:$EV_REAL_FAIL"
else
  no "⑩ 缺真实仓库账本（组⑥ 未产出）"
fi
# ── ⑩-e stdout 摘要行零百分比（创始人签字的形式判据之一）──
run_sut "$F1" "$TMPD/stdout10.json" > "$TMPD/stdout10.txt" 2>/dev/null  # swallow-ok: 本组只验 stdout 的形态（零百分比 + 含三档离散计数），派生器 stderr 的 degraded 日志已在组③ 单独断言
if grep -qE "[0-9]+(\.[0-9]+)?%" "$TMPD/stdout10.txt"; then
  no "⑩ 派生器 stdout 仍含百分比: $(cat "$TMPD/stdout10.txt")"
else
  ok "⑩ 派生器 stdout 零百分比（摘要行改离散计数）"
fi
grep -q "written_not_wired=" "$TMPD/stdout10.txt" \
  && ok "⑩ stdout 摘要含三档离散计数" || no "⑩ stdout 未见三档计数: $(cat "$TMPD/stdout10.txt")"

echo
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] || exit 1
exit 0
