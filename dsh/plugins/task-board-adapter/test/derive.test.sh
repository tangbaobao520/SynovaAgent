#!/usr/bin/env bash
# test/derive.test.sh — derive-board-sources.py 集成测试（D502）
# 覆盖矩阵（铁律 48）:
#   正常路径: 临时 git 仓库（含 task-state/审计报告/product-progress/todos）→ --no-fetch 派生 → 四源齐全 + 状态映射正确
#   降级路径: ① 无 origin/main ref → exit 2 且不写 snapshot ② todos.yaml 含转义引号 title 正确解析
#   边界条件: ③ --since-d 窗口过滤 ④ task-state 已有的 D# 不重复出现在 win_tasks ⑤ 簿记提交不作标题
# 环境: 需要 git + python3；缺失 → 显式 skip（计数，不静默）

set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../scripts/derive-board-sources.py"
PYBIN=""
for _c in python3 python; do
  if command -v "$_c" >/dev/null 2>&1 && "$_c" -c "import sys" >/dev/null 2>&1; then
    PYBIN="$_c"; break
  fi
done
PASS=0; FAIL=0; SKIP=0

ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
skip() { echo "  ⏭  $1"; SKIP=$((SKIP+1)); }

if [ -z "$PYBIN" ]; then
  skip "python3 不可用——derive 集成测试全部跳过"
  echo "pass=$PASS fail=$FAIL skip=$SKIP"; exit 0
fi

# ── 用例 1: 正常路径（四源齐全 + 窗口 + 去重 + 状态映射 + 转义引号）──
T1="$(mktemp -d /tmp/synova-derive.XXXXXX)"
git -C "$T1" init -q
git -C "$T1" config user.email t@t; git -C "$T1" config user.name tester
mkdir -p "$T1/task-state" "$T1/docs/synova/audit-reports" "$T1/docs/synova/product-lines" "$T1/docs/synova/coordination"
# ① task-state（含 D400 —— 应从 win_tasks 去重掉）
cat > "$T1/task-state/D400.json" <<'J'
{"task_id":"D400","title":"Mac任务","status":"audited"}
J
# ② Win 提交：D338（实质+审计）D340（实质无审计）D341（仅簿记）D100（窗口外）
mkdir -p "$T1/src"
echo a > "$T1/src/a.ts"; git -C "$T1" add -A; git -C "$T1" commit -qm "init"
echo b >> "$T1/src/a.ts"; git -C "$T1" add -A; git -C "$T1" -c user.name="Synova-Win" commit -qm "feat(D338): orgId 隔离 fail-closed"
echo c >> "$T1/src/a.ts"; git -C "$T1" add -A; git -C "$T1" -c user.name="Synova-Win" commit -qm "fix(D340): 修复X"
echo d >> "$T1/src/a.ts"; git -C "$T1" add -A; git -C "$T1" -c user.name="Synova-Win" commit -qm "chore(D341): bypass 补记 xyz"
echo e >> "$T1/src/a.ts"; git -C "$T1" add -A; git -C "$T1" -c user.name="Synova-Win" commit -qm "feat(D100): 远古任务"
# 审计报告只提 D338
echo "D338 审计通过" > "$T1/docs/synova/audit-reports/2026-08-22-D338.md"
# ③ product-progress
cat > "$T1/docs/synova/product-lines/product-progress.json" <<'J'
{"generated_at":"2026-08-23","product_progress_pct":5,"lines":[{"id":1,"name":"桌面端","total":8,"verified":0,"progress_pct":0},{"id":7,"name":"持续监测","total":8,"verified":2,"progress_pct":25}]}
J
# ④ todos（含转义引号 title）
cat > "$T1/docs/synova/product-lines/todos.yaml" <<'Y'
version: 1.0
todos:
# AUTO:START
  - id: "T-3-01"
    line: 3
    title: "报告\"一看就懂\"（S0-4）: 未验证"
    priority: P0
    owner: "DSH"
    depends: []
    acceptance: "GS-08 转绿"
# AUTO:END
manual: []
Y
git -C "$T1" add -A; git -C "$T1" commit -qm "data"
# 模拟已 fetch 状态：建立 remote-tracking ref（--no-fetch 时脚本从该 ref 读）
git -C "$T1" update-ref refs/remotes/origin/main HEAD
OUT1="$T1/snap.json"
"$PYBIN" "$SCRIPT" --repo-root "$T1" --out "$OUT1" --no-fetch >/dev/null 2>&1
if [ $? -eq 0 ] && [ -f "$OUT1" ]; then
  ok "正常路径 exit 0 + snapshot 落盘"
else
  bad "正常路径失败（exit $? / 无 snapshot）"
fi
# 逐断言（python 输出 0/1 供 bash 判定）
check() { "$PYBIN" -c "$1" "$OUT1" && ok "$2" || bad "$2"; }
check "import json,sys; d=json.load(open(sys.argv[1])); sys.exit(0 if len(d['task_state']['tasks'])==1 else 1)" "① task_state 1 条"
check "import json,sys; d=json.load(open(sys.argv[1])); w={t['task_id']:t for t in d['win_tasks']['tasks']}; sys.exit(0 if set(w)=={'D338','D340','D341'} else 1)" "② win 窗口=3（D100 窗口外剔除、D400 被 task-state 去重）"
check "import json,sys; d=json.load(open(sys.argv[1])); w={t['task_id']:t for t in d['win_tasks']['tasks']}; sys.exit(0 if w['D338']['status']=='audited' and w['D340']['status']=='committed' else 1)" "② D338→audited / D340→committed"
check "import json,sys; d=json.load(open(sys.argv[1])); w={t['task_id']:t for t in d['win_tasks']['tasks']}; sys.exit(0 if 'orgId 隔离' in w['D338']['title'] and '修复X' in w['D340']['title'] else 1)" "② 标题取非簿记提交（D340 非 chore: bypass）"
check "import json,sys; d=json.load(open(sys.argv[1])); sys.exit(0 if len(d['product_lines']['lines'])==2 and d['product_lines']['overall_pct']==5 else 1)" "③ product_lines 2 条 + overall 5%"
check "import json,sys; d=json.load(open(sys.argv[1])); t=d['todos']['items']; sys.exit(0 if len(t)==1 and '一看就懂' in t[0]['title'] and t[0]['priority']=='P0' else 1)" "④ todos 转义引号 title 正确解析"
rm -rf "$T1"

# ── 用例 2: 降级——无 origin/main → exit 2 不写 snapshot ──
T2="$(mktemp -d /tmp/synova-derive2.XXXXXX)"
git -C "$T2" init -q
git -C "$T2" config user.email t@t; git -C "$T2" config user.name tester
echo x > "$T2/f"; git -C "$T2" add -A; git -C "$T2" commit -qm "x"
OUT2="$T2/snap2.json"
"$PYBIN" "$SCRIPT" --repo-root "$T2" --out "$OUT2" --no-fetch >/dev/null 2>&1
RC=$?
if [ "$RC" -eq 2 ] && [ ! -f "$OUT2" ]; then
  ok "无 origin/main → exit 2 且不写 snapshot（fail-closed，绝不覆盖旧数据）"
else
  bad "降级失败 rc=$RC snapshot=$([ -f "$OUT2" ] && echo 存在 || echo 无)"
fi
# 原子写验证：预置旧 snapshot，硬失败不覆盖
echo '{"head":"old"}' > "$OUT2"
"$PYBIN" "$SCRIPT" --repo-root "$T2" --out "$OUT2" --no-fetch >/dev/null 2>&1
grep -q '"head":"old"' "$OUT2" && ok "硬失败不覆盖旧 snapshot（原子性）" || bad "旧 snapshot 被覆盖！"
rm -rf "$T2"

echo "pass=$PASS fail=$FAIL skip=$SKIP"
[ "$FAIL" -eq 0 ]
