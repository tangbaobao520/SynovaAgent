#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# check-pr-budget.test.sh — D734 PR 预算门禁测试
#
# 覆盖（铁律 48: 正常 / 降级 / 边界）:
#   1. 正常路径 — 小写集单域 → exit 0
#   2. 超预算  — 文件数 > 上限 → exit 1（且点明「拆 PR」）
#   3. 跨域    — 变更落两个域 → exit 1（调 D733 check-ownership 单域模式）
#   4. 边界    — 0 文件 / 恰好等于上限 / --max-files 注入
#   5. 降级    — 基线全链不可解析 → 显式 ⚠️ 留痕 + exit 0（不静默、不误红）
#   6. 检查失败 — 域校验器缺失 → exit 2（fail-closed）
#   7. 落后基线 — 沙箱 git 仓库落后 → ⚠️ 告警但 exit 0（不阻断）
#   8. 接线    — pre-commit 真调用本脚本（铁律 0-2 WIRE CHECK）+ 组数横幅未被改动
#
# 零真实仓库污染: 沙箱 mktemp + 沙箱 git 仓库（PLATFORM-CHECKLIST #6，git 身份用 -c 内联，禁 git config 持久写入）。
# ═══════════════════════════════════════════════════════════════════════════════
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TOOL="$REPO_DIR/scripts/control-tower/check-pr-budget.sh"
PC="$REPO_DIR/scripts/pre-commit-check.sh"

TMPD="$(mktemp -d)"
trap 'rm -rf "$TMPD"' EXIT

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }

OUT=""
run_expect() {
  local want="$1"; shift
  local desc="$1"; shift
  OUT="$(bash "$TOOL" "$@" 2>&1)"
  local got=$?
  if [ "$got" = "$want" ]; then pass "$desc (exit=$want)"
  else fail "$desc — 期望 exit=$want 实际 exit=$got"; echo "$OUT" | sed 's/^/      | /' >&2; fi
}

echo "═══════════════════════════════════════════════════════════"
echo "  D734 PR 预算门禁测试"
echo "═══════════════════════════════════════════════════════════"

echo ""
echo "── 1. 正常路径: 小写集单域 → exit 0 ──"
run_expect 0 "2 个 Mac 文件" --files "scripts/control-tower/check-pr-budget.sh tests/control-tower/check-pr-budget.test.sh"
if echo "$OUT" | grep -q "✅ ② 变更单域"; then pass "单域判定输出点名"; else fail "单域判定未点名"; fi

echo ""
echo "── 2. 超预算: 文件数 > 上限 → exit 1 ──"
run_expect 1 "13 文件 > 默认 12" --files "a1.ts a2.ts a3.ts a4.ts a5.ts a6.ts a7.ts a8.ts a9.ts a10.ts a11.ts a12.ts a13.ts"
if echo "$OUT" | grep -q "拆 PR"; then pass "超限输出点名「拆 PR」"; else fail "超限未点名拆 PR"; fi
if echo "$OUT" | grep -q "禁调高上限"; then pass "输出禁调高上限"; else fail "未出现禁调高上限"; fi
run_expect 0 "--max-files 20 时同写集放行" --max-files 20 --files "a1.ts a2.ts a3.ts a4.ts a5.ts a6.ts a7.ts a8.ts a9.ts a10.ts a11.ts a12.ts a13.ts"

echo ""
echo "── 3. 跨域: 变更落两个域 → exit 1 ──"
run_expect 1 "Mac 脚本 + Win src 混合" --files "scripts/control-tower/check-pr-budget.sh src/server.ts"
if echo "$OUT" | grep -q "变更跨域"; then pass "跨域输出点名"; else fail "跨域未点名"; fi
# 域判定豁免: bypass.log（各线都写的簿记）不应把单域 PR 误判成跨域
run_expect 0 "bypass.log 豁免后仍单域" --files ".claude/bypass.log scripts/control-tower/check-pr-budget.sh"
# D758: PR #538 实测形态——Win 的 1-5 双引导 + 它自己的验收证据，曾被判跨域卡死
run_expect 0 "D758 证据目录豁免: Win 代码 + 自己的验收证据 → 单域" --files "docs/synova/product-lines/evidence/D716-win-20260913/1-5-dual-guide-win-evidence.txt src/server.ts tests/routes/setup-guide-retired.test.ts"
run_expect 1 "D758 豁免不掩盖真跨域（证据 + Win 代码 + Mac 脚本）" --files "docs/synova/product-lines/evidence/D716-win-20260913/x.txt src/server.ts scripts/control-tower/check-pr-budget.sh"

echo ""
echo "── 4. 边界 ──"
run_expect 0 "0 文件（空写集）" --files ""
run_expect 0 "恰好等于上限" --max-files 2 --files "scripts/control-tower/check-pr-budget.sh tests/control-tower/check-pr-budget.test.sh"
run_expect 1 "上限 1、写集 2" --max-files 1 --files "scripts/control-tower/check-pr-budget.sh tests/control-tower/check-pr-budget.test.sh"

echo ""
echo "── 5. 降级: 基线全链不可解析 → 显式留痕 + exit 0（不误红）──"
# 沙箱用 trunk 而非 main：确保 origin/main / main / origin/HEAD 全链均不存在，才走降级分支
SB="$TMPD/sandbox-repo"
mkdir -p "$SB"
git -C "$SB" init -q -b trunk
git -C "$SB" -c user.name=t -c user.email=t@t commit -q --allow-empty -m c1
OUT="$(cd "$SB" && bash "$TOOL" 2>&1)"; _e=$?
[ "$_e" = 0 ] && pass "无任何基线的仓库 → exit 0" || fail "无基线仓库 — 期望 0 实际 $_e"
if echo "$OUT" | grep -q "degraded: 基线不可解析"; then pass "降级明示「基线不可解析」（不静默）"; else fail "降级未明示"; fi
if echo "$OUT" | grep -q "不静默放过"; then pass "降级说明不静默放过"; else fail "降级说明缺失"; fi

echo ""
echo "── 6. 检查失败: 域校验器缺失 → exit 2（fail-closed）──"
mkdir -p "$TMPD/nochecker"
cp "$TOOL" "$TMPD/nochecker/check-pr-budget.sh"
OUT="$(bash "$TMPD/nochecker/check-pr-budget.sh" --files "scripts/control-tower/check-pr-budget.sh" 2>&1)"; _e=$?
[ "$_e" = 2 ] && pass "缺 check-ownership.py → exit 2" || fail "缺域校验器 — 期望 2 实际 $_e"
if echo "$OUT" | grep -q "域校验器缺失"; then pass "缺口点名「域校验器缺失」"; else fail "缺口未点名"; fi

echo ""
echo "── 7. 落后基线: 沙箱仓库真落后 → ⚠️ 告警但 exit 0 ──"
SB2="$TMPD/behind-repo"
mkdir -p "$SB2"
git -C "$SB2" init -q -b main
git -C "$SB2" -c user.name=t -c user.email=t@t commit -q --allow-empty -m c1
git -C "$SB2" checkout -q -b feat
git -C "$SB2" checkout -q main
git -C "$SB2" -c user.name=t -c user.email=t@t commit -q --allow-empty -m c2
git -C "$SB2" checkout -q feat
OUT="$(cd "$SB2" && bash "$TOOL" --base main --max-behind 0 2>&1)"; _e=$?
[ "$_e" = 0 ] && pass "落后但未超文件/域预算 → exit 0（落后不阻断）" || fail "落后分支 — 期望 0 实际 $_e"
if echo "$OUT" | grep -q "③ 分支落后"; then pass "落后告警输出点名"; else fail "落后告警未点名"; fi

echo ""
echo "── 8. 接线（铁律 0-2 WIRE CHECK）──"
if grep -q "check-pr-budget.sh" "$PC"; then pass "接线: pre-commit-check.sh 真调用本脚本"; else fail "接线: pre-commit 未调用本脚本（死代码）"; fi
# 本任务不并组数：横幅语义必须保持原样（改则打破 fastlane-bypass-only.test.sh 断言）
if grep -q "跳过 12 组" "$PC"; then pass "组数横幅未改（快速通道仍为「跳过 12 组」）"; else fail "快速通道横幅被改动 → 会打破白名单外的 fastlane 测试"; fi
if grep -q "全部 13 组通过" "$PC"; then pass "总结横幅仍为 13 组（未并组）"; else fail "总结横幅组数被改"; fi

echo ""
echo "── 9. D788 只计审查面（治理产物不计入 ①②; fail-closed; 口径显性）──"
# 9a. 12 审查面 + 30 治理 → exit 0 且打印治理件数（派单用例① + K3 §5 条目 8 字面）
GOV30=""; for i in $(seq 1 30); do GOV30="${GOV30} docs/synova/audit-reports/r$i.md"; done
REV12="src/a1.ts src/a2.ts src/a3.ts src/a4.ts src/a5.ts src/a6.ts src/a7.ts src/a8.ts src/a9.ts src/a10.ts src/a11.ts src/a12.ts"
run_expect 0 "12 审查面 + 30 治理 → 放行" --files "$REV12$GOV30"
if echo "$OUT" | grep -q "审查面 12 件（上限 12）"; then pass "口径显性: 「审查面 12 件（上限 12）」字面存在"; else fail "缺「审查面 N 件（上限 12）」字面（铁律 11）"; fi
if echo "$OUT" | grep -q "治理产物 30 件（不计入）"; then pass "口径显性: 「治理产物 30 件（不计入）」字面存在"; else fail "缺「治理产物 M 件（不计入）」字面"; fi

# 9b. 13 审查面 + 0 治理 → exit 1（上限未被放宽, K3 §5 条目 5）
REV13="src/a1.ts src/a2.ts src/a3.ts src/a4.ts src/a5.ts src/a6.ts src/a7.ts src/a8.ts src/a9.ts src/a10.ts src/a11.ts src/a12.ts src/a13.ts"
run_expect 1 "13 审查面 → 拦（上限 12 不变）" --files "$REV13"
if echo "$OUT" | grep -q "审查面 13 件（上限 12）"; then pass "超限点名审查面 13 件"; else fail "超限未按审查面口径点名"; fi

# 9c. 跨域审查面仍拦（K3 §5 条目 4: src=win 域 + scripts=mac 域）
run_expect 1 "两域审查面 src/x.ts + scripts/y.sh → 拦" --files "src/x.ts scripts/control-tower/y.sh"
if echo "$OUT" | grep -q "变更跨域"; then pass "跨域仍拦（治理豁免不掩盖真跨域）"; else fail "跨域未拦"; fi

# 9d. fail-closed（K3 §5 条目 2）: 未列入排除表的未知目录默认计入
run_expect 0 "unknown_dir/x.ts 计入审查面（1 件 ≤ 12 放行）" --files "unknown_dir/x.ts docs/y.md"
if echo "$OUT" | grep -q "审查面 1 件"; then pass "fail-closed: 未列路径默认计入（新目录不逃逸）"; else fail "未知目录被静默豁免（F2 违规）"; fi

# 9e. N_FILES 语义（K3 §5 条目 3）: 审查面 0 + 治理 3 → PASS 且禁「无变更文件」失真
run_expect 0 "审查面 0 + 治理 3 → PASS" --files "docs/a.md task-state/D9.json .claude/bypass.log"
if echo "$OUT" | grep -q "治理产物 3 件（不计入）"; then pass "治理 3 件显性打印"; else fail "治理件数未打印（F3 静默违规）"; fi
if echo "$OUT" | grep -q "无变更文件"; then fail "审查面 0+治理 3 却输出「无变更文件」（F3 失真）"; else pass "无「无变更文件」失真输出"; fi
if echo "$OUT" | grep -q "治理产物 3 件不计入域判定"; then pass "② 域判定跳过原因显性（治理不计入）"; else fail "② 跳过原因未区分治理件数"; fi

# 9f. 反向验证（K3 §5 条目 6 / 派单用例④）: 沙箱副本把 src/ 加进治理排除表 → 9b 变绿; 原脚本 → 红
#     物理证明排除表真被读（mutate-copy, 不设环境变量旁路——env 缝 = 生产旁路通道, D390 教训）
MUT="$TMPD/mutated"; mkdir -p "$MUT/scripts/control-tower"
cp "$TOOL" "$MUT/scripts/control-tower/check-pr-budget.sh"
cp "$REPO_DIR/scripts/control-tower/check-ownership.py" "$MUT/scripts/control-tower/" 2>/dev/null || true
python3 - "$MUT/scripts/control-tower/check-pr-budget.sh" <<'PYEOF'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
old = "GOV_PREFIX_RE='^(docs/|task-state/|\\.claude/|memory/)'"
new = "GOV_PREFIX_RE='^(docs/|task-state/|\\.claude/|memory/|src/)'"
assert old in s, "GOV_PREFIX_RE anchor not found — script contract drifted"
open(p, "w", encoding="utf-8").write(s.replace(old, new))
PYEOF
OUT2="$(bash "$MUT/scripts/control-tower/check-pr-budget.sh" --files "$REV13" 2>&1)"; _e2=$?
if [ "$_e2" = 0 ] && echo "$OUT2" | grep -q "审查面 0 件"; then pass "反向: src/ 入排除表 → 13 src 文件计 0 → 绿（排除表真被读）"; else fail "反向验证失败 — 期望 exit 0 审查面 0, 实际 exit=$_e2"; fi
OUT3="$(bash "$TOOL" --files "$REV13" 2>&1)"; _e3=$?
[ "$_e3" = 1 ] && pass "反向恢复: 原脚本 13 src → 红（exit 1）" || fail "恢复后应红, 实际 $_e3"

echo ""
echo "═══════════════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  echo "  ✅ 全部通过: $PASS 项"
  echo "═══════════════════════════════════════════════════════════"
  exit 0
else
  echo "  ❌ $FAIL 项失败 / $PASS 项通过"
  echo "═══════════════════════════════════════════════════════════"
  exit 1
fi
