#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# pr-queue-scan.test.sh — D811 未合 PR 队列台账扫描器密封测试
#
# 被测对象: scripts/project/pr-queue-scan.py
#   @input  — GitHub API（GET）+ 本地 git 只读 + task-state 卡；--input 可离线夹具
#   @output — 快照 JSON（schema pr-queue-snapshot/1）+ 台账 markdown/表格
#   @limit  — 上限 12 是**提示层**：超限出告警但**退出码仍 0**（只提示不拦死）
#   @degraded — 未知字段一律 null/"unknown"，禁静默填 0；--strict 才非零退出
#
# 覆盖矩阵:
#   ① 正常路径 — 台账列齐 + metrics 逐项手算对账
#   ② 上限红   — 13 > 12 → warning 非空 + stdout 告警 + **exit 0**（不拦死）
#   ③ 上限绿   — 12 = 12 → warning null + 无告警（边界：等于上限不算超）
#   ④ 关闭规则 — 五条理由逐条正例 + 负例（不误报）
#   ⑤ 降级     — content_in_main=null 不判真 / ci_state=unknown ≠ none，计数不并桶
#   ⑥ 幂等     — 同输入两次，除 generated_at 外逐键相等
#   ⑦ 纯读     — 跑完夹具树逐字节不变（只落声明的输出），真仓库 git status 不变
#
# 沙箱: mktemp 临时夹具 + 固定时钟 --today（零平台 date 差异，Win/CI 确定性）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SUT="$REPO/scripts/project/pr-queue-scan.py"
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

TODAY="2026-09-20"   # 固定时钟：age/超期判定全部相对它

jget() { # jget <json-file> <dotted.path>
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

mk_fixture() { # mk_fixture <out.json> <n_prs> [extra-json-patch-file]
  "$PYBIN" - "$1" "$2" <<'PY'
import json,sys
out,n = sys.argv[1], int(sys.argv[2])
recs=[]
for i in range(n):
    recs.append({
        "number": 900+i, "title": "夹具 PR %d" % i, "owner": "mac-coding",
        "owner_source": "branch-prefix", "owner_conflict": False,
        "head_ref": "feat/fixture-%d" % i, "head_sha": "%040d" % i,
        "draft": False, "created_at": "2026-09-20",
        "age_days": i, "behind": i, "ahead": 3,
        "changed_files": 3, "mergeable_state": "clean",
        "ci_state": "success", "ci_failing": 0, "ci_total": 5,
        "content_in_main": False, "files_total": 3,
        "card": None, "card_status": None,
    })
json.dump(recs, open(out,"w",encoding="utf-8"), ensure_ascii=False, indent=1)
PY
}

run_fixture() { # run_fixture <fixture.json> <out.json> [extra args...]
  local fx="$1" out="$2"; shift 2
  "$PYBIN" "$SUT" --input "$fx" --today "$TODAY" --repo-root "$TMPD" \
    --out-json "$out" "$@"
}

echo "═══ ① 正常路径：台账列齐 + metrics 手算对账 ═══"
FX3="$TMPD/fx3.json"; OUT3="$TMPD/out3.json"; mk_fixture "$FX3" 3
run_fixture "$FX3" "$OUT3" --print table > "$TMPD/o3.txt" 2>&1
RC=$?
[ "$RC" = "0" ] && ok "退出码 0（未超限）" || no "退出码应 0，实 $RC"
for col in "#" "标题" "主人" "behind" "CI" "age(天)" "可自动关闭"; do
  grep -q "$col" "$TMPD/o3.txt" && ok "台账含列: $col" || no "台账缺列: $col"
done
[ "$(jget "$OUT3" metrics.queue_length)" = "3" ] && ok "queue_length=3" || no "queue_length 应 3，实 $(jget "$OUT3" metrics.queue_length)"
[ "$(jget "$OUT3" metrics.over_limit)" = "False" ] && ok "over_limit=false" || no "over_limit 应 false"
[ "$(jget "$OUT3" metrics.limit)" = "12" ] && ok "上限=12（默认）" || no "limit 应 12"
[ "$(jget "$OUT3" metrics.oldest.age_days)" = "2" ] && ok "最老 age=2（3 条夹具 0/1/2）" || no "oldest 应 2，实 $(jget "$OUT3" metrics.oldest.age_days)"
[ "$(jget "$OUT3" metrics.behind_distribution.0)" = "1" ] && ok "behind 分布: 0 桶=1" || no "behind 0 桶应 1"
[ "$(jget "$OUT3" warning)" = "None" ] && ok "未超限 → warning=null" || no "warning 应 null，实 $(jget "$OUT3" warning)"

echo
echo "═══ ② 上限红：13 > 12 → 告警出现，但**只提示不拦死**（exit 0）═══"
FX13="$TMPD/fx13.json"; OUT13="$TMPD/out13.json"; mk_fixture "$FX13" 13
run_fixture "$FX13" "$OUT13" --print table > "$TMPD/o13.txt" 2>&1
RC=$?
[ "$RC" = "0" ] && ok "超限时退出码仍 0（只提示不拦死）" || no "超限退出码应 0，实 $RC"
[ "$(jget "$OUT13" metrics.over_limit)" = "True" ] && ok "over_limit=true" || no "over_limit 应 true"
grep -q "先退役再开新 PR" "$TMPD/o13.txt" \
  && ok "stdout 显式告警含「先退役再开新 PR」" || no "stdout 未见超限告警"
grep -q "队列超限：13 > 12" "$TMPD/o13.txt" \
  && ok "告警带实测数字 13 > 12" || no "告警数字不对"
W13="$(jget "$OUT13" warning)"
case "$W13" in *"13 > 12"*) ok "快照 warning 带实测数字（可挂看板）";; *) no "快照 warning 缺数字: $W13";; esac
[ "$(jget "$OUT13" records.12.number)" = "912" ] && ok "13 条记录全量落快照（末条 #912）" || no "快照记录数不对"

echo
echo "═══ ③ 上限绿：12 = 12 → 无告警（边界，等于上限不算超）═══"
FX12="$TMPD/fx12.json"; OUT12="$TMPD/out12.json"; mk_fixture "$FX12" 12
run_fixture "$FX12" "$OUT12" --print table > "$TMPD/o12.txt" 2>&1
RC=$?
[ "$RC" = "0" ] && ok "退出码 0" || no "退出码应 0"
[ "$(jget "$OUT12" metrics.over_limit)" = "False" ] && ok "12 = 上限 → over_limit=false（边界不误报）" \
  || no "12 条不应判超限"
grep -q "先退役再开新 PR" "$TMPD/o12.txt" && no "12 条不应出现告警" || ok "无告警（绿）"

echo
echo "═══ ④ 关闭规则：五条理由逐条正例 + 负例（不误报）═══"
FXR="$TMPD/fxrules.json"
"$PYBIN" - "$FXR" <<'PY'
import json,sys
def rec(n, **kw):
    base={"number":n,"title":"规则夹具 %d"%n,"owner":"mac-coding","owner_source":"branch-prefix",
          "owner_conflict":False,"head_ref":"feat/r-%d"%n,"head_sha":"a"*40,"draft":False,
          "created_at":"2026-09-01","age_days":1,"behind":10,"ahead":2,"changed_files":2,
          "mergeable_state":"clean","ci_state":"success","ci_failing":0,"ci_total":5,
          "content_in_main":False,"files_total":2,"card":None,"card_status":None}
    base.update(kw); return base
recs=[
 rec(1, ahead=0),                                  # CONTENT_IN_MAIN（无独有提交）
 rec(2, content_in_main=True),                     # CONTENT_IN_MAIN（逐字节已入 main）
 rec(3, card_status="closed"),                     # CARD_CLOSED
 rec(4, card_status="rejected"),                   # CARD_CLOSED
 rec(5, ci_state="failure", age_days=7),           # CI_RED_LONG（恰好阈值 = 命中）
 rec(6, ci_state="failure", age_days=6),           # 负例：差一天不命中
 rec(7, owner="unknown", owner_source="unattributed", age_days=14),  # ORPHAN_STALE（阈值=命中）
 rec(8, owner="unknown", owner_source="unattributed", age_days=13),  # 负例：差一天不命中
 rec(9),                                           # 负例：全绿应留队列
 rec(10, content_in_main=None, ahead=2),           # 负例：null 不是 true，不判关闭
]
json.dump(recs,open(sys.argv[1],"w",encoding="utf-8"),ensure_ascii=False,indent=1)
PY
OUTR="$TMPD/outrules.json"; run_fixture "$FXR" "$OUTR" --print summary >/dev/null 2>&1
chk() { # chk <pr-index> <expect-reason>
  local got; got="$(jget "$OUTR" "records.$1.close_reasons")"
  case "$got" in *"$2"*) ok "夹具记录 $((1+$1))（index $1）命中 $2";; *) no "记录 $1 应含 $2，实 $got";; esac
}
chk 0 "CONTENT_IN_MAIN"
chk 1 "CONTENT_IN_MAIN"
chk 2 "CARD_CLOSED"
chk 3 "CARD_CLOSED"
chk 4 "CI_RED_LONG"
chk 6 "ORPHAN_STALE"
[ "$(jget "$OUTR" records.5.closeable)" = "False" ] && ok "负例: age=6+CI 红 → 不判关闭（阈值 7）" \
  || no "记录 5 不应可关，实 $(jget "$OUTR" records.5.close_reasons)"
[ "$(jget "$OUTR" records.7.closeable)" = "False" ] && ok "负例: 无主 age=13 → 不判关闭（阈值 14）" \
  || no "记录 7 不应可关"
[ "$(jget "$OUTR" records.8.closeable)" = "False" ] && ok "负例: 全绿年轻 PR 留队列" || no "记录 8 不应可关"
[ "$(jget "$OUTR" records.9.closeable)" = "False" ] && ok "负例: content_in_main=null 不判真（禁 null 冒充 true）" \
  || no "记录 9 不应可关"
[ "$(jget "$OUTR" metrics.closeable_count)" = "6" ] && ok "可关计数=6（手算：夹具 1/2/3/4/5/7）" \
  || no "closeable_count 应 6，实 $(jget "$OUTR" metrics.closeable_count)"
[ "$(jget "$OUTR" metrics.by_reason.CI_RED_LONG)" = "1" ] && ok "by_reason 分理由计数正确" \
  || no "by_reason 不对: $(jget "$OUTR" metrics.by_reason)"

echo
echo "═══ ⑤ 降级：unknown 不并桶、null 不当 0 ═══"
FXD="$TMPD/fxdeg.json"
"$PYBIN" - "$FXD" <<'PY'
import json,sys
base={"title":"降级夹具","owner":"k3","owner_source":"branch-prefix","owner_conflict":False,
      "head_ref":"audit/k3-x","head_sha":"b"*40,"draft":False,"created_at":"2026-09-19",
      "age_days":1,"ahead":1,"changed_files":None,"mergeable_state":None,
      "content_in_main":None,"files_total":None,"card":None,"card_status":None}
recs=[dict(base, number=1, behind=None, ci_state="unknown", ci_failing=None, ci_total=None),
      dict(base, number=2, behind=3, ci_state="none", ci_failing=0, ci_total=0)]
json.dump(recs,open(sys.argv[1],"w",encoding="utf-8"),ensure_ascii=False,indent=1)
PY
OUTD="$TMPD/outdeg.json"; run_fixture "$FXD" "$OUTD" --print summary >/dev/null 2>&1
[ "$(jget "$OUTD" metrics.behind_unknown)" = "1" ] && ok "behind=null 单列 unknown，不并进 behind 0 桶" \
  || no "behind_unknown 应 1，实 $(jget "$OUTD" metrics.behind_unknown)"
[ "$(jget "$OUTD" metrics.behind_distribution.0)" = "0" ] && ok "behind 0 桶仍为 0（未被 null 污染）" \
  || no "behind 0 桶被污染"
[ "$(jget "$OUTD" metrics.ci_distribution.unknown)" = "1" ] && ok "ci_state=unknown 单列" \
  || no "ci unknown 计数不对"
[ "$(jget "$OUTD" metrics.ci_distribution.none)" = "1" ] && ok "ci_state=none 与 unknown 不混为一谈" \
  || no "ci none/unknown 混桶"
[ "$(jget "$OUTD" records.0.closeable)" = "False" ] && ok "未知态不触发关闭（fail-closed）" || no "未知态误判可关"

echo
echo "═══ ⑥ 幂等：同输入两次，除 generated_at 外逐键相等 ═══"
A="$TMPD/idem-a.json"; B="$TMPD/idem-b.json"
run_fixture "$FX13" "$A" --quiet >/dev/null 2>&1
run_fixture "$FX13" "$B" --quiet >/dev/null 2>&1
IDEM="$("$PYBIN" - "$A" "$B" <<'PY'
import json,sys
a=json.load(open(sys.argv[1],encoding='utf-8')); b=json.load(open(sys.argv[2],encoding='utf-8'))
a.pop('generated_at',None); b.pop('generated_at',None)
print("SAME" if a==b else "DIFF")
PY
)"
[ "$IDEM" = "SAME" ] && ok "两次派生逐键相等（除 generated_at）" || no "幂等失败: $IDEM"

echo
echo "═══ ⑦ 纯函数层（离线直测：内容判定 / 归属 / 分桶 / D# 提取）═══"
UNIT="$("$PYBIN" - "$SUT" <<'PY'
import importlib.util, sys
spec = importlib.util.spec_from_file_location("pqs", sys.argv[1])
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
fail = []
def eq(label, got, want):
    if got != want: fail.append("%s: got %r want %r" % (label, got, want))
# 内容判定：空 diff = 已入 main（squash 合并残留）；噪声文件不参与；无索引不判假
eq("empty-diff", m.content_landed([], {"a.py": "x"}), (True, "empty-diff"))
eq("blob-identical", m.content_landed([{"filename": "a.py", "sha": "x", "status": "added"}],
                                      {"a.py": "x"}), (True, "blob-identical"))
eq("blob-mismatch", m.content_landed([{"filename": "a.py", "sha": "y", "status": "modified"}],
                                     {"a.py": "x"}), (False, None))
eq("noise-only", m.content_landed([{"filename": ".claude/bypass.log", "sha": "z"}],
                                  {".claude/bypass.log": "w"}), (None, None))
eq("no-index", m.content_landed([], None), (None, None))
eq("removed-ok", m.content_landed([{"filename": "gone.py", "sha": "s", "status": "removed"}], {}),
   (True, "blob-identical"))
eq("removed-bad", m.content_landed([{"filename": "gone.py", "sha": "s", "status": "removed"}],
                                   {"gone.py": "s"}), (False, None))
# 归属：卡 owner 与 domain 矛盾 → 显式冲突，不静默取一个
eq("owner-conflict", m.derive_owner("team/win-x", "mac-coding", "win")[2], True)
eq("owner-ok", m.derive_owner("team/win-x", "win-coding", "win")[2], False)
eq("owner-prefix", m.derive_owner("audit/k3-2026", None, None), ("k3", "branch-prefix", False))
eq("owner-unknown", m.derive_owner("weird/thing", None, None), ("unknown", "unattributed", False))
eq("d-extract", m.extract_d("fix/d839-claim-release"), "D839")
eq("d-extract-title", m.extract_d("docs(D811): 队列收口"), "D811")
eq("d-none", m.extract_d("chore/nothing"), None)
# 分桶：机械分桶，null 单列不并进 0
for n, want in ((None, "unknown"), (0, "0"), (1, "1-5"), (5, "1-5"), (6, "6-20"),
                (20, "6-20"), (21, "21-100"), (100, "21-100"), (101, "100+")):
    eq("bucket-%s" % n, m.behind_bucket(n), want)
print("UNIT-FAIL=%d" % len(fail))
for f in fail: print("  " + f)
PY
)"
UNIT_N="$(echo "$UNIT" | grep -o 'UNIT-FAIL=[0-9]*' | cut -d= -f2)"
[ "$UNIT_N" = "0" ] && ok "纯函数层 24 项断言全过（内容判定/归属冲突/D#/分桶）" \
  || { no "纯函数层 $UNIT_N 项失败"; echo "$UNIT" | sed 's/^/    /'; }

echo
echo "═══ ⑧ 纯读：夹具树逐字节不变 + 真仓库 git status 不变 ═══"
snap() { find "$1" -type f | sort | while read -r f; do
  "$PYBIN" -c "import hashlib,sys;print(sys.argv[1], hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest()[:16])" "$f"; done; }
ROOTF="$TMPD/ro-root"; mkdir -p "$ROOTF/task-state"
BEFORE="$(snap "$ROOTF")"
run_fixture "$FX3" "$TMPD/ro-out.json" --out-md "$TMPD/ro-out.md" --quiet >/dev/null 2>&1
AFTER="$(snap "$ROOTF")"
[ "$BEFORE" = "$AFTER" ] && ok "夹具仓库树零改动（输出只落声明的 --out-json/--out-md）" \
  || no "夹具仓库被写入未声明的路径"
GS_BEFORE="$(cd "$REPO" && git status --porcelain | sort)"
"$PYBIN" "$SUT" --input "$FX3" --today "$TODAY" --repo-root "$REPO" \
  --out-json "$TMPD/ro-out2.json" --quiet >/dev/null 2>&1
GS_AFTER="$(cd "$REPO" && git status --porcelain | sort)"
[ "$GS_BEFORE" = "$GS_AFTER" ] && ok "真仓库工作区零改动（纯读）" || no "真仓库工作区被改动"
grep -q "subprocess.run" "$SUT" && grep -q '"rev-parse", "rev-list", "diff", "cat-file", "merge-base", "ls-tree"' "$SUT" \
  && ok "git 调用受只读白名单约束（源码级）" || no "git 白名单缺失"
grep -qE '"(push|reset|checkout|commit|merge|close|reopen)"' "$SUT" \
  && no "源码出现写操作/关 PR 动作" || ok "源码无写操作、无关闭 PR 动作"

echo
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] || exit 1
exit 0
