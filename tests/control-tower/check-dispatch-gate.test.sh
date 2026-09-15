#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# check-dispatch-gate.test.sh — D778 派单文档复核门禁（配对测试，ct-test-gate 约定）
#
# 覆盖矩阵（编码指令 §二.2: 绿/红×2/降级×2/边界×2/接线/集成/性能）:
#   绿     — 合格派单文档 → exit 0 + GATE-OK
#   红-a   — 缺「依据计划」行 → exit 1 + 点名「依据计划」
#   红-b   — 缺「内部一致性」自检段 → exit 1 + 点名「内部一致性」
#   降级-a — 复核脚本缺失（SYNO_PRE_DISPATCH_BIN 指空）→ exit 2 + degraded 显式留痕
#   降级-b — 复核脚本自身 exit 2 → 门禁传播 exit 2（不静默当绿）
#   边界-a — SYNO_PRE_DISPATCH_DOCS 置空回退探测（注入只能加不能减，fail-closed）
#   边界-b — 沙箱 git 仓库: staged 编码指令-*.md 不触发；staged 派单-*.md 才触发（自动探测 glob）
#   接线   — pre-commit-check.sh 真调用（CT-34 早退分支 + 主流程两处; 铁律 0-2 WIRE CHECK）
#   集成   — SYNO_CI=1 全量 pre-commit: 坏派单 → exit 1 必红; 好派单 → exit 0（CT-34 路径）
#   性能   — 无派单文档跳过 <2s（契约 <1s + 冷启动余量, D563 教训勿过脆）
# 沙箱: mktemp + HOME 指空（无 GITHUB_TOKEN → §② 确定性跳过）; 夹具不含 #PRN/file:line（零网络）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$REPO/scripts/control-tower/check-dispatch-gate.sh"
PC="$REPO/scripts/pre-commit-check.sh"
PASS=0; FAIL=0
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }; no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD=$(mktemp -d); trap 'rm -rf "$TMPD"' EXIT
SANDBOX_HOME="$TMPD/home"; mkdir -p "$SANDBOX_HOME"

# 夹具公共件: 主线计划哈希/版本 + 已登记 D#（不硬编码, 与 pre-dispatch-check.test.sh 同款取法）
PH=$(shasum -a 256 "$REPO"/docs/synova/coordination/整体推进计划-主线-*.md 2>/dev/null | head -1 | cut -c1-8)  # swallow-ok: 计划缺失→哈希空→夹具必红，探测非吞错
PV=$(grep -m1 -oE '版本: *v[0-9]+\.[0-9]+' "$REPO"/docs/synova/coordination/整体推进计划-主线-*.md 2>/dev/null | grep -oE 'v[0-9]+\.[0-9]+')  # swallow-ok: 版本探测缺失→夹具必红
DREG=$(ls "$REPO"/task-state/D*.json 2>/dev/null | head -1 | grep -oE "D[0-9]{3}")  # swallow-ok: 无登记→空→夹具跳过，探测非吞错

# run_gate <env...> — 统一跑门禁（HOME 指沙箱保证 §② 离线确定性; 空间分隔 env 由调用处给）
run_gate(){ ( cd "$REPO" && env HOME="$SANDBOX_HOME" GITHUB_TOKEN= "$@" bash "$GATE" ); }

# ── 夹具 ──
cat > "$TMPD/good.md" <<MD
# 派单：${DREG} 沙箱好派单
依据计划: ${PV}@${PH}
- 写集: scripts/control-tower/pre-dispatch-check.sh

## 派单内部一致性自检
各单验收命令已逐条比对，无互斥要求。
MD
# 红-a: 删「依据计划」行（其余全好——保证红因唯一可点名）
grep -v '^依据计划:' "$TMPD/good.md" > "$TMPD/bad-plan.md"
# 红-b: 删自检段（保留依据计划）
sed '/派单内部一致性/,/^$/d' "$TMPD/good.md" > "$TMPD/bad-selfcheck.md"
grep -q '内部一致性' "$TMPD/bad-selfcheck.md" && no "夹具自检: bad-selfcheck 仍含自检段（夹具失效）"

echo "=== D778 派单文档复核门禁 ==="

# ① 绿: 合格派单 → exit 0 + GATE-OK
if OUT=$(run_gate SYNO_PRE_DISPATCH_DOCS="$TMPD/good.md" 2>&1); then
  echo "$OUT" | grep -q "GATE-OK" && ok "① 绿: 合格派单 exit 0 + GATE-OK" || no "① 缺 GATE-OK 标记"
else
  no "① 绿: 合格派单应 exit 0, 实际输出: $(echo "$OUT" | tail -2 | tr '\n' ' ')"
fi

# ② 红-a: 缺「依据计划」→ exit 1 + 点名
OUT=$(run_gate SYNO_PRE_DISPATCH_DOCS="$TMPD/bad-plan.md" 2>&1); RC=$?
[ "$RC" -eq 1 ] && ok "② 红-a: 缺依据计划 → exit 1" || no "② 红-a: 期望 exit 1 实得 $RC"
echo "$OUT" | grep -q '依据计划' && ok "② 红-a: 输出点名「依据计划」" || no "② 红-a: 未点名依据计划"

# ③ 红-b: 缺自检段 → exit 1 + 点名
OUT=$(run_gate SYNO_PRE_DISPATCH_DOCS="$TMPD/bad-selfcheck.md" 2>&1); RC=$?
[ "$RC" -eq 1 ] && ok "③ 红-b: 缺自检段 → exit 1" || no "③ 红-b: 期望 exit 1 实得 $RC"
echo "$OUT" | grep -q '内部一致性' && ok "③ 红-b: 输出点名「内部一致性」" || no "③ 红-b: 未点名内部一致性"

# ④ 降级-a: 复核脚本缺失 → exit 2 + degraded 显式留痕（不静默当绿）
OUT=$(run_gate SYNO_PRE_DISPATCH_DOCS="$TMPD/good.md" SYNO_PRE_DISPATCH_BIN="$TMPD/no-such-script.sh" 2>&1); RC=$?
[ "$RC" -eq 2 ] && ok "④ 降级-a: 复核脚本缺失 → exit 2（三态, 不与通过混同）" || no "④ 降级-a: 期望 exit 2 实得 $RC"
echo "$OUT" | grep -q 'degraded' && ok "④ 降级-a: degraded 显式留痕" || no "④ 降级-a: 无 degraded 留痕（静默当绿 = 铁律 11 违规）"

# ⑤ 降级-b: 复核脚本自身 exit 2 → 门禁传播 exit 2
printf '#!/bin/bash\necho "❌ 派单文档不存在: 沙箱"\nexit 2\n' > "$TMPD/stub-degraded.sh"
OUT=$(run_gate SYNO_PRE_DISPATCH_DOCS="$TMPD/good.md" SYNO_PRE_DISPATCH_BIN="$TMPD/stub-degraded.sh" 2>&1); RC=$?
[ "$RC" -eq 2 ] && echo "$OUT" | grep -q 'GATE-DEGRADED' && ok "⑤ 降级-b: 复核 exit 2 传播为门禁 exit 2 + 标记" || no "⑤ 降级-b: 期望 exit 2+GATE-DEGRADED 实得 $RC: $(echo "$OUT" | tail -1)"

# ⑥ 边界-a: 注入缝置空 → 回退自动探测（空暂存 → 跳过; 注入只能加不能减）
if OUT=$(cd "$REPO" && env HOME="$SANDBOX_HOME" SYNO_PRE_DISPATCH_DOCS="" bash "$GATE" 2>&1); then
  echo "$OUT" | grep -q '跳过' && ok "⑥ 边界-a: 空注入回退探测→跳过（fail-closed 方向）" || no "⑥ 边界-a: 空注入未回退探测"
else
  no "⑥ 边界-a: 空注入不应报错（宿主暂存区有派单文档时会真检——属加严非旁路）"
fi

# ⑦ 边界-b: 沙箱 git 仓库——自动探测 glob 只认 派单-*.md，不误拦其他文档
SB="$TMPD/repo"; mkdir -p "$SB/docs/synova/coordination" "$SB/task-state"
( cd "$SB" && git init -q . && git config user.email t@t && git config user.name t )
cp "$REPO"/docs/synova/coordination/整体推进计划-主线-*.md "$SB/docs/synova/coordination/"
cp "$REPO"/task-state/${DREG}.json "$SB/task-state/"
cat > "$SB/docs/synova/coordination/派单-sandbox-fixture.md" <<MD
# 派单：${DREG} 沙箱探测
依据计划: ${PV}@${PH}

## 派单内部一致性自检
无互斥。
MD
printf '# 编码指令-沙箱（非派单文档，不应被拦）\n正文无 D 号无路径。\n' > "$SB/docs/synova/coordination/编码指令-sandbox.md"
# D521/D555: 沙箱 git 操作剥 GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE，防宿主 index 污染
( cd "$SB" && env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE \
  git add docs/synova/coordination/派单-sandbox-fixture.md docs/synova/coordination/编码指令-sandbox.md )
OUT=$( cd "$SB" && env HOME="$SANDBOX_HOME" GITHUB_TOKEN= bash "$GATE" 2>&1 ); RC=$?
[ "$RC" -eq 0 ] && ok "⑦ 边界-b: 派单+非派单同暂存 → exit 0（好派单放行）" || no "⑦ 边界-b: 期望 0 实得 $RC: $(echo "$OUT" | tail -1)"
echo "$OUT" | grep -q '派单-sandbox-fixture' && ok "⑦ 边界-b: 自动探测命中 派单-*.md（正向）" || no "⑦ 边界-b: 未探测到派单文档"
echo "$OUT" | grep -q '编码指令' && no "⑦ 边界-b: 误拦非派单文档" || ok "⑦ 边界-b: 编码指令-*.md 不被误拦（负向）"

# ⑧ 边界-b': 只暂存非派单文档 → 跳过 + 性能 <2s
( cd "$SB" && env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE \
  git rm -q --cached docs/synova/coordination/派单-sandbox-fixture.md )
T0=$(date +%s); OUT=$( cd "$SB" && env HOME="$SANDBOX_HOME" GITHUB_TOKEN= bash "$GATE" 2>&1 ); RC=$?; T1=$(date +%s)
[ "$RC" -eq 0 ] && echo "$OUT" | grep -q '跳过' && ok "⑧ 边界: 仅非派单文档 → 跳过（条件跳过不误拦）" || no "⑧ 边界: 期望跳过, 实得 $RC: $(echo "$OUT" | tail -1)"
DUR=$((T1 - T0)); [ "$DUR" -lt 2 ] && ok "⑧ 性能: 跳过路径 ${DUR}s < 2s（契约 <1s）" || no "⑧ 性能: 跳过路径 ${DUR}s ≥ 2s"

# ⑨ 接线（铁律 0-2 WIRE CHECK）: pre-commit 真调用——CT-34 早退分支 + 主流程两处
grep -q 'check-dispatch-gate.sh' "$PC" && ok "⑨ 接线: 门禁脚本被 pre-commit-check.sh 调用" || no "⑨ 接线: pre-commit 未调用门禁脚本"
CALLS=$(grep -cE '^[[:space:]]*d778_dispatch_gate$' "$PC" || true)
[ "${CALLS:-0}" -ge 2 ] && ok "⑨ 接线: d778_dispatch_gate 两处调用（CT-34 早退分支 + 主流程）" || no "⑨ 接线: 调用点 ${CALLS:-0} < 2（纯派单提交会被漏拦）"

# ⑩ 集成-红: SYNO_CI=1 全量 pre-commit（CT-34 路径）+ 坏派单 → 必红
OUT=$( cd "$REPO" && env SYNO_TEST_ARM=1 SYNO_CI=1 \
  SYNO_GIT_CACHED_NAMES="docs/synova/coordination/派单-fixture-it.md" \
  SYNO_GIT_CACHED_ALL_NAMES="docs/synova/coordination/派单-fixture-it.md" \
  SYNO_GIT_CACHED_ADDED_NAMES="docs/synova/coordination/派单-fixture-it.md" \
  SYNO_PRE_DISPATCH_DOCS="$TMPD/bad-plan.md" \
  SYNO_GATEKEEPER_ACK=1 SYNO_SKIP_PARALLEL_WARN=1 \
  SYNO_GATE_HITS_LOG="$(mktemp)" SYNO_EXEMPT_LOG="$(mktemp)" \
  bash "$PC" 2>&1 ); RC=$?
[ "$RC" -eq 1 ] && ok "⑩ 集成-红: SYNO_CI=1 坏派单 → pre-commit exit 1（必红）" || no "⑩ 集成-红: 期望 exit 1 实得 $RC"
echo "$OUT" | grep -q 'D778' && ok "⑩ 集成-红: 输出点名 D778" || no "⑩ 集成-红: 未点名 D778"

# ⑪ 集成-绿: 同路径 + 好派单 → exit 0
OUT=$( cd "$REPO" && env SYNO_TEST_ARM=1 SYNO_CI=1 \
  SYNO_GIT_CACHED_NAMES="docs/synova/coordination/派单-fixture-it.md" \
  SYNO_GIT_CACHED_ALL_NAMES="docs/synova/coordination/派单-fixture-it.md" \
  SYNO_GIT_CACHED_ADDED_NAMES="docs/synova/coordination/派单-fixture-it.md" \
  SYNO_PRE_DISPATCH_DOCS="$TMPD/good.md" \
  SYNO_GATEKEEPER_ACK=1 SYNO_SKIP_PARALLEL_WARN=1 \
  SYNO_GATE_HITS_LOG="$(mktemp)" SYNO_EXEMPT_LOG="$(mktemp)" \
  bash "$PC" 2>&1 ); RC=$?
[ "$RC" -eq 0 ] && echo "$OUT" | grep -q 'D778 派单文档复核' && ok "⑪ 集成-绿: SYNO_CI=1 好派单 → exit 0 + D778 复核行" || no "⑪ 集成-绿: 期望 exit 0, 实得 $RC: $(echo "$OUT" | grep D778 | head -1)"

echo ""
echo "  结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
