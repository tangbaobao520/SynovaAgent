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
#   9. D860 治理产物豁免 / 10. 豁免反例（伪装成治理产物的代码仍计数）
#  11. D911 B3 standby 代行通道 — 夹具全 hermetic（自造 ownership.yaml + 自造 brief/正文）:
#      ① standby 生效但无「## 代行声明」→ 仍 exit 1｜② 条目缺「— 理由」/仅标点 → 该条不生效 → exit 1
#      ③ 删 standby 段 → 立即恢复严格 exit 1｜④ 对抗: --pr-body 无该段 → 仍 exit 1｜⑤ standby 非法 → exit 2
#      ＋ GREEN（授权 + 逐条理由 → exit 0 且逐条打印）/ 声明源全不可得 → fail-closed
#      ＋ 两条反例: 代行不放宽 ≤12 预算 / 代行不掩盖第三域
#
# 零真实仓库污染: 沙箱 mktemp + 沙箱 git 仓库（PLATFORM-CHECKLIST #6，git 身份用 -c 内联，禁 git config 持久写入）。
# 声明源可控: GITHUB_EVENT_PATH 在 CI 恒存在 → 顶部 unset，避免第 11 段断言随运行环境漂移。
# ═══════════════════════════════════════════════════════════════════════════════
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
set -uo pipefail
unset GITHUB_EVENT_PATH

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
echo "── 9. D860 治理产物豁免: 不计入 ≤12 预算 ──"
# #657/#693 实测形态: 12 交付文件 + 治理产物上枝 → 13/14 件被拦（F9/F12）
run_expect 0 "12 交付文件 + brief/卡/Note/规格 各 1 → 豁免 4 件后 12 计数放行" --files "task-state/D999.json .claude/task-briefs/brief.md memory/notes/implemented/note.md docs/plans/spec.md scripts/control-tower/check-pr-budget.sh tests/control-tower/check-pr-budget.test.sh scripts/control-tower/a3.sh scripts/control-tower/a4.sh scripts/control-tower/a5.sh scripts/control-tower/a6.sh scripts/control-tower/a7.sh scripts/control-tower/a8.sh scripts/control-tower/a9.sh scripts/control-tower/a10.sh"
if echo "$OUT" | grep -q "D860 治理产物豁免: 4 件"; then pass "豁免件数点名（可见，不静默）"; else fail "豁免行未输出"; fi
run_expect 0 "memory/notes yaml 也豁免" --files "memory/notes/proposed/d.yaml scripts/control-tower/check-pr-budget.sh"
run_expect 0 "自验证据目录豁免（docs/synova/product-lines/evidence/）" --files "docs/synova/product-lines/evidence/D860-20260921/a.txt scripts/control-tower/check-pr-budget.sh"

echo ""
echo "── 10. D860 反例: 伪装成治理产物的代码必须仍被计数 ──"
run_expect 1 "13 件纯代码仍被拦（豁免不放宽真代码）" --files "a1.ts a2.ts a3.ts a4.ts a5.ts a6.ts a7.ts a8.ts a9.ts a10.ts a11.ts a12.ts a13.ts"
run_expect 1 "反例: task-state/evil.ts（代码伪装进治理前缀）→ 仍计数 13 > 12" --files "task-state/evil.ts a1.ts a2.ts a3.ts a4.ts a5.ts a6.ts a7.ts a8.ts a9.ts a10.ts a11.ts a12.ts"
if echo "$OUT" | grep -q "13 > 上限 12"; then pass "反例计数点名 13"; else fail "反例计数未点名"; fi
run_expect 1 "反例: .claude/task-briefs/evil.sh 仍计数" --files ".claude/task-briefs/evil.sh a1.ts a2.ts a3.ts a4.ts a5.ts a6.ts a7.ts a8.ts a9.ts a10.ts a11.ts a12.ts"

echo ""
echo "── 11. D911 B3 standby 代行通道（夹具全 hermetic: 自造 ownership.yaml + 自造 brief/正文）──"
# 夹具自带 ownership.yaml（含 standby 段）→ 不依赖仓内台账当前内容；域授权由 check-ownership.py 判定。
FIX="$TMPD/d911b"
mkdir -p "$FIX"
cat > "$FIX/standby.yaml" <<'YAML'
version: 1
owners:
  mac: "Mac"
  win: "Win"
  k3: "K3"
github:
  mac: "@t"
  win: "@t"
  k3: "@t"
rules:
  - glob: "**"
    owner: "win"
  - glob: "scripts/audit/**"
    owner: "k3"
  - glob: "scripts/control-tower/**"
    owner: "mac"
standby:
  win:
    offline_since: "2026-09-20"
    proxy: "mac"
    authority: "创始人 2026-09-20 口令（测试夹具，非真实台账）"
    domains: ["win"]
YAML
# ③ 删除 standby 段 = win 回归 = 严格（夹具即「删段」的可执行形态）
sed '/^standby:/,$d' "$FIX/standby.yaml" > "$FIX/strict.yaml"
# ⑤ standby 段结构非法（缺必填 authority）
cat > "$FIX/bad.yaml" <<'YAML'
version: 1
owners:
  mac: "Mac"
  win: "Win"
rules:
  - glob: "**"
    owner: "win"
  - glob: "scripts/control-tower/**"
    owner: "mac"
standby:
  win:
    proxy: "mac"
YAML
printf '# 夹具 brief\n\n## 写集\n\n- x\n' > "$FIX/decl-none.md"
printf '# 夹具 brief\n\n## 代行声明\n\n- src/server.ts\n' > "$FIX/decl-noreason.md"
printf '# 夹具 brief\n\n## 代行声明\n\n- src/server.ts ——\n' > "$FIX/decl-punct.md"
printf '# 夹具 brief\n\n## 代行声明\n\n- src/server.ts — 夹具理由：修 win 侧门禁误拦\n' > "$FIX/decl-ok.md"
printf '# 夹具 brief\n\n##代行声明\n\n- src/server.ts — 无空格标题（同 D708 的 \\s* 口径）\n' > "$FIX/decl-nospace.md"
printf '## 摘要\n\n普通 PR 正文，无声明段。\n' > "$FIX/body-plain.md"
printf '## 代行声明\n\n- src/server.ts — PR 正文里逐条写的理由\n' > "$FIX/body-decl.md"
X="scripts/control-tower/x.sh src/server.ts"

run_expect 1 "① standby 生效 + 无「## 代行声明」→ 仍硬阻断" --yaml "$FIX/standby.yaml" --decl-file "$FIX/decl-none.md" --files "$X"
if echo "$OUT" | grep -q "代行未声明"; then pass "① 阻断理由点名「代行未声明」"; else fail "① 未点名代行未声明"; fi
if echo "$OUT" | grep -q "变更跨域"; then pass "① 仍保留「变更跨域」结论行"; else fail "① 缺「变更跨域」结论行"; fi

run_expect 0 "GREEN standby 授权 + 逐条理由 → 放行（先红后绿的绿腿）" --yaml "$FIX/standby.yaml" --decl-file "$FIX/decl-ok.md" --files "$X"
if echo "$OUT" | grep -q "↪ 代行放行: src/server.ts  归属=win"; then pass "放行逐条打印「路径 + 归属」"; else fail "放行未逐条打印路径/归属"; fi
if echo "$OUT" | grep -q "理由: 夹具理由：修 win 侧门禁误拦"; then pass "放行逐条打印「理由」"; else fail "放行未打印理由"; fi

run_expect 1 "② 条目缺「— 理由」→ 该条不生效 → 仍硬阻断" --yaml "$FIX/standby.yaml" --decl-file "$FIX/decl-noreason.md" --files "$X"
if echo "$OUT" | grep -q "代行声明条目不生效"; then pass "② 明示「条目不生效」（不静默）"; else fail "② 未明示条目不生效"; fi
run_expect 1 "②b 理由仅标点（——）→ 该条不生效 → 仍硬阻断" --yaml "$FIX/standby.yaml" --decl-file "$FIX/decl-punct.md" --files "$X"
if echo "$OUT" | grep -q "代行声明条目不生效"; then pass "②b 明示「条目不生效」"; else fail "②b 未明示条目不生效"; fi

# ③ 用**合法声明**做夹具: 声明成立也必须阻断 → 证明「删 standby 段」本身就恢复严格（win 回归可执行验证）
run_expect 1 "③ 删 standby 段 → 立即恢复严格（声明合法也必须阻断）" --yaml "$FIX/strict.yaml" --decl-file "$FIX/decl-ok.md" --files "$X"
if echo "$OUT" | grep -q "无授权代行对"; then pass "③ 点名「无授权代行对 → 严格判定」"; else fail "③ 未点名无授权代行对"; fi
if echo "$OUT" | grep -q "不生效"; then pass "③ 域校验器逐条打印「不代行」（不静默）"; else fail "③ 未逐条打印不代行"; fi

# ④ 对抗样本（最易 fail-open 点）: 只有 PR 正文可用且**不含**该段 → 必须仍阻断
run_expect 1 "④ 对抗: --pr-body 无该段 + --decl-file 关闭 → 仍硬阻断" --yaml "$FIX/standby.yaml" --pr-body "$FIX/body-plain.md" --decl-file "" --files "$X"
if echo "$OUT" | grep -q "无「## 代行声明」段"; then pass "④ 点名「读到文本但无段」"; else fail "④ 未点名无该段"; fi
if echo "$OUT" | grep -q "代行未声明"; then pass "④ 点名「代行未声明」"; else fail "④ 未点名代行未声明"; fi

run_expect 2 "⑤ standby 段结构非法（缺 authority）→ exit 2 fail-closed" --yaml "$FIX/bad.yaml" --decl-file "$FIX/decl-ok.md" --files "$X"
if echo "$OUT" | grep -q "fail-closed"; then pass "⑤ 明示 fail-closed"; else fail "⑤ 未明示 fail-closed"; fi

run_expect 1 "fail-closed: 声明源全不可得 → 不放行任何被代行文件" --yaml "$FIX/standby.yaml" --decl-file "$FIX/does-not-exist.md" --files "$X"
if echo "$OUT" | grep -q "声明源不可得"; then pass "点名「声明源不可得」"; else fail "未点名声明源不可得"; fi

run_expect 0 "GREEN-2 标题无空格「##代行声明」→ 放行（与 D708 \\s* 同型）" --yaml "$FIX/standby.yaml" --decl-file "$FIX/decl-nospace.md" --files "$X"
run_expect 0 "GREEN-3 声明源＝PR 正文（--pr-body）→ 放行" --yaml "$FIX/standby.yaml" --pr-body "$FIX/body-decl.md" --decl-file "" --files "$X"
if echo "$OUT" | grep -q "声明源=--pr-body"; then pass "回执点名声明来源（可核）"; else fail "回执未点名声明来源"; fi

run_expect 1 "反例: 代行放行不放宽 ①≤12 预算（1 被代行 + 12 交付 = 13 计数）" --yaml "$FIX/standby.yaml" --decl-file "$FIX/decl-ok.md" --files "src/server.ts scripts/control-tower/a1.sh scripts/control-tower/a2.sh scripts/control-tower/a3.sh scripts/control-tower/a4.sh scripts/control-tower/a5.sh scripts/control-tower/a6.sh scripts/control-tower/a7.sh scripts/control-tower/a8.sh scripts/control-tower/a9.sh scripts/control-tower/a10.sh scripts/control-tower/a11.sh scripts/control-tower/a12.sh"
if echo "$OUT" | grep -q "13 > 上限 12"; then pass "代行不豁免 ①（预算仍拦）"; else fail "代行疑似放宽了预算"; fi

run_expect 1 "反例: 三域（mac+win+k3）→ 代行不掩盖真跨域（k3 不被吞）" --yaml "$FIX/standby.yaml" --decl-file "$FIX/decl-ok.md" --files "scripts/control-tower/x.sh src/server.ts scripts/audit/a.py"
if echo "$OUT" | grep -q "代行范围之外的域"; then pass "点名「代行范围之外的域」"; else fail "未点名代行范围之外的域"; fi
if echo "$OUT" | grep -q "↪ 代行放行"; then fail "三域场景下仍放行了部分文件（应整 PR 阻断）"; else pass "三域场景整 PR 阻断（不放行任何被代行文件）"; fi

run_expect 0 "回归: 纯 win 写集（无跨域）不得因 standby 而被要求声明" --yaml "$FIX/standby.yaml" --decl-file "$FIX/decl-none.md" --files "src/server.ts src/other.ts"

# 契约三要素（铁律 47）—— 仅作存在性补充，行为证据以上面夹具为准
if grep -q -- "--pr-body" "$TOOL" && grep -q -- "--decl-file" "$TOOL"; then pass "契约: 新增 --pr-body / --decl-file 已暴露"; else fail "契约: 新选项未暴露"; fi
if grep -q "@degraded" "$TOOL" && grep -q "@input" "$TOOL" && grep -q "@exit" "$TOOL"; then pass "契约: @input/@exit/@degraded 齐备"; else fail "契约三要素缺失"; fi

echo ""
echo "── 12. D911 B3 声明源② 认领制解析（沙箱仓: 只用自造 current-brief / brief）──"
# 缺省声明源**不得钉死某份 brief**（钉死 → 他人/陈旧 brief 的残留条目放行本 PR = fail-open 面）。
# 用沙箱仓控 REPO_ROOT: 工具按 $SCRIPT_DIR/../.. 解析 → 自造 .claude/current-brief 才有意义。
# 沙箱内**故意放一份诱饵**在旧的钉死路径上（含合法声明）—— 指针缺失时它绝不能被读到。
SBX="$TMPD/declrepo"
mkdir -p "$SBX/scripts/control-tower" "$SBX/scripts/product-lines" "$SBX/.claude/task-briefs"
cp "$TOOL" "$SBX/scripts/control-tower/check-pr-budget.sh"
cp "$REPO_DIR/scripts/control-tower/check-ownership.py" "$SBX/scripts/control-tower/check-ownership.py"
cp "$REPO_DIR/scripts/product-lines/productline_yaml.py" "$SBX/scripts/product-lines/productline_yaml.py"
printf '# 夹具 brief（无声明段）\n\n## 写集\n\n- x\n' > "$SBX/.claude/task-briefs/2026-01-01-nodecl.md"
printf '# 夹具 brief（有声明段）\n\n## 代行声明\n\n- src/server.ts — 沙箱认领指针解析夹具\n' > "$SBX/.claude/task-briefs/2026-01-02-decl.md"
printf '# 诱饵（旧钉死路径）\n\n## 代行声明\n\n- src/server.ts — 陈旧他人 brief 的残留声明（绝不应据此放行）\n' > "$SBX/.claude/task-briefs/2026-09-22-D911-B-ownership-standby.md"
TOOLSB="$SBX/scripts/control-tower/check-pr-budget.sh"
CB="$SBX/.claude/current-brief"
run_sbx() {
  local want="$1"; shift
  local desc="$1"; shift
  OUT="$(bash "$TOOLSB" "$@" 2>&1)"
  local got=$?
  if [ "$got" = "$want" ]; then pass "$desc (exit=$want)"
  else fail "$desc — 期望 exit=$want 实际 exit=$got"; echo "$OUT" | sed 's/^/      | /' >&2; fi
}

printf '2026-01-01-nodecl.md\n' > "$CB"
run_sbx 1 "认领指针 → 无声明段的 brief → 仍硬阻断" --yaml "$FIX/standby.yaml" --files "$X"
if echo "$OUT" | grep -q "认领指针 → 2026-01-01-nodecl.md"; then pass "点名解析到的 brief（可核）"; else fail "未点名解析到的 brief"; fi

printf '2026-01-02-decl.md\n' > "$CB"
run_sbx 0 "认领指针 → 有声明段的 brief → 放行" --yaml "$FIX/standby.yaml" --files "$X"
if echo "$OUT" | grep -q "声明源=decl-file:2026-01-02-decl.md"; then pass "逐条行点名「是哪份文件放行的」"; else fail "逐条行未点名声明文件"; fi
if echo "$OUT" | grep -q "✅ PASS PR 预算内（2 文件）；代行放行 1 件（声明源: decl-file:2026-01-02-decl.md）"; then pass "PASS 行带声明源（绿腿证据可见）"; else fail "PASS 行未带声明源"; fi

# ★ 核心反例: 指针缺失 + 旧钉死路径上有含声明的诱饵 → 必须 exit 1（证明不回落固定路径）
rm -f "$CB"
run_sbx 1 "指针缺失 + 旧钉死路径有诱饵 → 仍阻断（绝不回落固定路径）" --yaml "$FIX/standby.yaml" --files "$X"
if echo "$OUT" | grep -q "无声明源②"; then pass "点名「无声明源②」"; else fail "未点名无声明源②"; fi
if echo "$OUT" | grep -q "↪ 代行放行"; then fail "读到了诱饵并放行（fail-open！）"; else pass "诱饵未被采信（不放行）"; fi

printf 'nope-does-not-exist.md\n' > "$CB"
run_sbx 1 "指针指向不存在的 brief → 仍阻断" --yaml "$FIX/standby.yaml" --files "$X"
if echo "$OUT" | grep -q "不存在 → 无声明源②"; then pass "点名「指向不存在」"; else fail "未点名指向不存在"; fi

rm -f "$CB"
printf '2026-01-01-nodecl.md\n' > "$SBX/.claude/current-brief.FAKESID"
DSH_SESSION_ID=FAKESID run_sbx 1 "session 专属指针优先（无声明段 → 阻断）" --yaml "$FIX/standby.yaml" --files "$X"
printf '2026-01-02-decl.md\n' > "$SBX/.claude/current-brief.FAKESID"
printf '2026-01-01-nodecl.md\n' > "$CB"
DSH_SESSION_ID=FAKESID run_sbx 0 "session 专属指针优先于全局（有声明段 → 放行）" --yaml "$FIX/standby.yaml" --files "$X"

# 显式 --decl-file 覆盖一切（优先级 ① 高于认领指针）
printf '2026-01-01-nodecl.md\n' > "$CB"
run_sbx 0 "显式 --decl-file 覆盖认领指针 → 放行" --yaml "$FIX/standby.yaml" --decl-file "$SBX/.claude/task-briefs/2026-01-02-decl.md" --files "$X"

echo ""
echo "── 8. 接线（铁律 0-2 WIRE CHECK）──"
if grep -q "check-pr-budget.sh" "$PC"; then pass "接线: pre-commit-check.sh 真调用本脚本"; else fail "接线: pre-commit 未调用本脚本（死代码）"; fi
# 本任务不并组数：横幅语义必须保持原样（改则打破 fastlane-bypass-only.test.sh 断言）
if grep -q "跳过 12 组" "$PC"; then pass "组数横幅未改（快速通道仍为「跳过 12 组」）"; else fail "快速通道横幅被改动 → 会打破白名单外的 fastlane 测试"; fi
if grep -q "全部 13 组通过" "$PC"; then pass "总结横幅仍为 13 组（未并组）"; else fail "总结横幅组数被改"; fi

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
