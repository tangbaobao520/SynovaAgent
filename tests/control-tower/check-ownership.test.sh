#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# ownership.test.sh — D733 ownership 机器化测试（ownership.yaml + check-ownership.py）
#
# 覆盖（铁律 48: 正常 / 降级 / 边界）:
#   1. 正常路径 — Mac/K3 正例归属正确（--owner 一致 → exit 0）
#   2. 越域    — 派单 §一 验收两条 + 单域模式跨域 → exit 1
#   3. 真实回归 — CTO 2026-09-13 两次派错线的实写集（D728 / D729）→ 派给 mac 必红
#   4. 反向验证 — 删掉 ownership.yaml 兜底规则 → 上述两条变绿（证明校验真在读数据）
#   5. 降级    — yaml 缺失 / yaml 语法非法 → exit 2（fail-closed，不与「通过」混同）
#   6. 边界    — 无文件参数 / 未知 owner / 尚未创建的文件路径
#   7. 产物契约 — .github/CODEOWNERS == --emit-codeowners 逐字节（drift 门禁）
#   8. 结构契约 — ownership.yaml 恰有一条 default 兜底规则（防「删兜底」静默逃逸）
#
# 零真实仓库污染: 全部读操作 + mktemp 沙箱（PLATFORM-CHECKLIST #6）；不写仓库任何文件。
# ═══════════════════════════════════════════════════════════════════════════════
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TOOL="$REPO_DIR/scripts/control-tower/check-ownership.py"
YAML="$REPO_DIR/docs/synova/coordination/ownership.yaml"
CODEOWNERS="$REPO_DIR/.github/CODEOWNERS"

# PLATFORM-CHECKLIST #1: PYBIN 三级探测（禁裸 python3 —— Win 部分机器无 python3.exe）
PYBIN=""
for _c in python3 python py; do
  if command -v "$_c" >/dev/null 2>&1 && "$_c" -c "import sys" >/dev/null 2>&1; then PYBIN="$_c"; break; fi
done
if [ -z "$PYBIN" ]; then echo "❌ python 不可用 — 无法运行 ownership 测试" >&2; exit 2; fi

TMPD="$(mktemp -d)"
trap 'rm -rf "$TMPD"' EXIT

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }

# run <期望exit> <说明> <args...>  → 捕获 stdout/stderr 到 ${OUT}，比对退出码
OUT=""
run_expect() {
  local want="$1"; shift
  local desc="$1"; shift
  OUT="$("$PYBIN" "$TOOL" "$@" 2>&1)"
  local got=$?
  if [ "$got" = "$want" ]; then pass "$desc (exit=$want)"
  else fail "$desc — 期望 exit=$want 实际 exit=$got"; echo "$OUT" | sed 's/^/      | /' >&2; fi
}

echo "═══════════════════════════════════════════════════════════"
echo "  D733 ownership 机器化测试"
echo "═══════════════════════════════════════════════════════════"

echo ""
echo "── 1. 正常路径: 各域正例归属一致 → exit 0 ──"
run_expect 0 "src/sentinel/ Mac 正例"      src/sentinel/runner.ts --owner mac
run_expect 0 "src/cron/ Mac 正例"          src/cron/cron-scheduler.ts --owner mac
run_expect 0 "src/mcp/ Mac 正例"           src/mcp/server.ts --owner mac
run_expect 0 "scripts/control-tower/ Mac"  scripts/control-tower/alloc-task-id.sh --owner mac
run_expect 0 "tests/control-tower/ Mac"    tests/control-tower/ownership.test.sh --owner mac
run_expect 0 "coordination 文档 Mac"       docs/synova/coordination/ownership.yaml --owner mac
run_expect 0 "src/（非例外）= Win"         src/l3/expert-registry.ts --owner win
run_expect 0 "src/server.ts = Win 专属"    src/server.ts --owner win
run_expect 0 "scripts/audit/ = K3"         scripts/audit/check-gates-v2.py --owner k3

echo ""
echo "── 2. 越域: 派单 §一 验收两条（必须非零）──"
run_expect 1 "验收① src/server.ts --owner mac"   src/server.ts --owner mac
run_expect 1 "验收② src/evidence/x.ts --owner mac" src/evidence/x.ts --owner mac
run_expect 1 "Mac 文件派给 win 也越域（对称）"      src/sentinel/runner.ts --owner win
run_expect 1 "K3 红线派给 mac 越域"                scripts/audit/audit-rules.sh --owner mac

echo ""
echo "── 3. 真实回归: CTO 2026-09-13 两次派错线的实写集 ──"
# D728（CTO 裁决书 commit 9aaf0c68 §A: 写集 100% 落 Win 域，却派给 Mac 线）
run_expect 1 "D728 回归: 整写集派给 mac 必红" \
  src/evidence/evidence-store.ts src/routes/diagnosis.ts src/routes/conversations.ts \
  src/agent/conversation-engine.ts src/agent/diagnosis-launcher.ts src/agent/engine-context.ts \
  src/server.ts --owner mac
# D729（同批派给 Mac 线；其中两文件为 Win 域）
run_expect 1 "D729 回归: Win 域两文件派给 mac 必红" \
  src/l4/graph-bridge.ts src/agent/post-diagnosis-processor.ts --owner mac

echo ""
echo "── 4. 单域模式（无 --owner）──"
OUT="$("$PYBIN" "$TOOL" src/sentinel/runner.ts src/cron/cron-scheduler.ts 2>&1)"; _e=$?
[ "$_e" = 0 ] && pass "单域模式: 全 Mac → exit 0" || fail "单域模式: 全 Mac — 期望 exit=0 实际 $_e"
OUT="$("$PYBIN" "$TOOL" src/sentinel/runner.ts src/l3/expert-registry.ts 2>&1)"; _e=$?
[ "$_e" = 1 ] && pass "单域模式: Mac+Win 混合 → exit 1（跨域）" || fail "单域模式: 混合 — 期望 exit=1 实际 $_e"
if echo "$OUT" | grep -q "跨域"; then pass "跨域输出点名「跨域」"; else fail "跨域输出未点名"; fi

echo ""
echo "── 4b. 域判定豁免 domain_neutral（D734 前置：各线都写的簿记不构成域信号）──"
OUT="$("$PYBIN" "$TOOL" .claude/bypass.log tests/control-tower/check-ownership.test.sh 2>&1)"; _e=$?
[ "$_e" = 0 ] && pass "bypass.log 豁免: 只剩 mac → exit 0" || fail "bypass.log 豁免失败 — 期望 0 实际 $_e"
if echo "$OUT" | grep -q "domain-neutral"; then pass "豁免路径明示 domain-neutral（不静默）"; else fail "豁免路径未明示"; fi
OUT="$("$PYBIN" "$TOOL" .claude/bypass.log src/l3/expert-registry.ts src/sentinel/runner.ts 2>&1)"; _e=$?
[ "$_e" = 1 ] && pass "豁免不掩盖真跨域（Mac+Win 仍 exit 1）" || fail "豁免掩盖了跨域 — 期望 1 实际 $_e"
run_expect 0 "豁免路径不参与 --owner 断言" .claude/bypass.log task-state/D733.json --owner mac
run_expect 1 "非豁免路径仍受 --owner 断言（回归）" src/sentinel/runner.ts --owner win

# D758: 验收证据目录（docs/synova/product-lines/evidence/**）——证据跟干活那条线走，不构成域信号
OUT="$("$PYBIN" "$TOOL" docs/synova/product-lines/evidence/D716-win-20260913/1-5-dual-guide-win-evidence.txt src/server.ts 2>&1)"; _e=$?
[ "$_e" = 0 ] && pass "D758 证据目录豁免: Win 代码 + 自己的验收证据 → exit 0" || fail "D758 证据豁免失败 — 期望 0 实际 $_e"
if echo "$OUT" | grep -q "domain-neutral"; then pass "D758 证据路径明示 domain-neutral（不静默）"; else fail "D758 证据路径未明示"; fi
OUT="$("$PYBIN" "$TOOL" docs/synova/product-lines/evidence/D716-win-20260913/x.txt scripts/control-tower/check-ownership.py 2>&1)"; _e=$?
[ "$_e" = 0 ] && pass "D758 Win 证据 + Mac 控制塔脚本 → 仍单域（证据不掺域）" || fail "D758 单域判定失败 — 期望 0 实际 $_e"
OUT="$("$PYBIN" "$TOOL" docs/synova/product-lines/evidence/D716-win-20260913/x.txt src/server.ts scripts/control-tower/check-ownership.py 2>&1)"; _e=$?
[ "$_e" = 1 ] && pass "D758 豁免不掩盖真跨域（Win 代码 + Mac 脚本仍 exit 1）" || fail "D758 豁免掩盖了跨域 — 期望 1 实际 $_e"
run_expect 0 "D758 豁免路径不参与 --owner 断言" docs/synova/product-lines/evidence/D716-win-20260913/x.txt --owner win

echo ""
echo "── 5. 反向验证: 删掉兜底规则 → 验收两条必须变绿（证明真在读 yaml）──"
NO_DEFAULT="$TMPD/ownership-no-default.yaml"
cp "$YAML" "$NO_DEFAULT"
"$PYBIN" - "$NO_DEFAULT" <<'PYEOF'
import pathlib, sys
p = pathlib.Path(sys.argv[1])
t = p.read_text(encoding="utf-8")
start = t.index('  - glob: "**"')
end = t.index('  - glob: "extensions/**"')
p.write_text(t[:start] + t[end:], encoding="utf-8")
PYEOF
if grep -q 'glob: "\*\*"' "$NO_DEFAULT"; then fail "反向验证前置: 兜底规则未删掉"; else pass "反向验证前置: 兜底规则已移除"; fi
run_expect 0 "删兜底 → src/server.ts 变绿"     src/server.ts --owner mac --yaml "$NO_DEFAULT"
run_expect 0 "删兜底 → src/evidence/x.ts 变绿" src/evidence/x.ts --owner mac --yaml "$NO_DEFAULT"
run_expect 1 "原 yaml 复测仍红（未污染真实文件）" src/server.ts --owner mac --yaml "$YAML"
if echo "$OUT" | grep -q "越域"; then pass "复测输出点名「越域」"; else fail "复测输出未点名越域"; fi
OUT="$("$PYBIN" "$TOOL" src/server.ts --owner mac --yaml "$NO_DEFAULT" 2>&1)"
if echo "$OUT" | grep -q "无归属规则匹配"; then pass "无归属时明示 ⚠️（不静默）"; else fail "无归属未明示（疑似静默降级）"; fi

echo ""
echo "── 6. 降级与边界（fail-closed → exit 2）──"
run_expect 2 "yaml 不存在 → exit 2"      src/server.ts --owner mac --yaml "$TMPD/nope.yaml"
printf 'rules:\n  - glob: "**"\n   bad_indent: 1\n' > "$TMPD/bad.yaml"
run_expect 2 "yaml 语法非法 → exit 2"    src/server.ts --owner mac --yaml "$TMPD/bad.yaml"
printf 'rules: []\n' > "$TMPD/empty.yaml"
run_expect 2 "rules 为空 → exit 2"       src/server.ts --owner mac --yaml "$TMPD/empty.yaml"
printf '{"not": "mapping"}\n' > "$TMPD/scalar.yaml"
run_expect 2 "yaml 非映射 → exit 2"      src/server.ts --owner mac --yaml "$TMPD/scalar.yaml"
OUT="$("$PYBIN" "$TOOL" 2>&1)"; _e=$?
[ "$_e" = 2 ] && pass "无文件参数 → exit 2" || fail "无文件参数 — 期望 exit=2 实际 $_e"
OUT="$("$PYBIN" "$TOOL" src/server.ts --owner bogus 2>&1)"; _e=$?
[ "$_e" = 2 ] && pass "未知 owner → exit 2（argparse 拒绝）" || fail "未知 owner — 期望 exit=2 实际 $_e"
run_expect 0 "尚未创建的文件路径也可判域" src/evidence/not-yet-created.ts --owner win

echo ""
echo "── 7. 产物契约: CODEOWNERS == --emit-codeowners（drift 门禁）──"
if [ -f "$CODEOWNERS" ]; then
  "$PYBIN" "$TOOL" --emit-codeowners > "$TMPD/CODEOWNERS.gen" 2> "$TMPD/emit.err"
  _emit_e=$?
  [ "$_emit_e" = 0 ] || fail "--emit-codeowners 执行失败 (exit=$_emit_e): $(head -3 "$TMPD/emit.err")"
  if diff -q "$TMPD/CODEOWNERS.gen" "$CODEOWNERS" >/dev/null 2>&1; then
    pass "drift: .github/CODEOWNERS 与生成结果逐字节一致"
  else
    fail "drift: CODEOWNERS 漂移 —— 重跑 --emit-codeowners > .github/CODEOWNERS"; diff "$TMPD/CODEOWNERS.gen" "$CODEOWNERS" | head -10 >&2
  fi
  run_expect 0 "--emit-codeowners exit 0" --emit-codeowners
else
  fail "drift: .github/CODEOWNERS 不存在"
fi
# CODEOWNERS 语义: 宽规则在前、例外在后（最后匹配者胜出 → 例外才生效）
SRC_LINE=$(grep -n '^\*  *@' "$CODEOWNERS" | head -1 | cut -d: -f1)
SENT_LINE=$(grep -n '^src/sentinel/' "$CODEOWNERS" | head -1 | cut -d: -f1)
if [ -n "$SRC_LINE" ] && [ -n "$SENT_LINE" ] && [ "$SRC_LINE" -lt "$SENT_LINE" ]; then
  pass "CODEOWNERS 顺序: 兜底($SRC_LINE) 在 Mac 例外($SENT_LINE) 之前"
else
  fail "CODEOWNERS 顺序错: 兜底行=${SRC_LINE} 例外行=${SENT_LINE}（例外会被吞）"
fi

echo ""
echo "── 8. 结构契约: ownership.yaml 恰有一条 default 兜底规则 ──"
NDEF=$(grep -c 'default: true' "$YAML" | tr -d '\n\r')
NDEF="${NDEF//[^0-9]/}"
[ "$NDEF" = "1" ] && pass "default 规则恰 1 条" || fail "default 规则 $NDEF 条（期望恰 1 —— 删兜底会让越域静默变绿）"
for pat in 'src/sentinel/**' 'src/cron/**' 'src/mcp/**' 'scripts/audit/**' 'scripts/control-tower/**'; do
  if grep -qF "glob: \"$pat\"" "$YAML"; then pass "显式规则存在: $pat"; else fail "缺显式规则: $pat"; fi
done

echo ""
echo "── 9. 生产接线（铁律 0-2 WIRE CHECK）──"
# D733 第④项（pre-dispatch-check.sh 消费）依赖未合入的 PR #536 → 本 PR 只断言
# 「产物消费」这一条已成立；派单消费方的接线断言随 #536 合入后补。
if grep -q "check-ownership.py" "$CODEOWNERS" 2>/dev/null; then
  pass "接线: CODEOWNERS 头声明由 check-ownership.py 生成（产物消费成立）"
else
  fail "接线: CODEOWNERS 未声明生成来源"
fi

echo ""
echo "── 10. D911 切片 B: standby 代行开关（B1/B2/B4）──"
# 基线: 不传 --proxy → 严格（= 修前行为，与 D733 同款「跨域」）
run_expect 1 "B4 严格模式: 不传 --proxy → 跨域 exit 1" \
  tests/agent/x.ts tests/circular-dependency.test.ts scripts/control-tower/check-ownership.py
if echo "$OUT" | grep -q "跨域"; then pass "严格模式输出点名「跨域」"; else fail "严格模式未点名跨域"; fi

# B2: 代行断言命中 → 改判同域 + 逐条打印归属与理由
run_expect 0 "B2 代行生效: --proxy win=mac → exit 0" --proxy win=mac \
  tests/agent/x.ts tests/circular-dependency.test.ts scripts/control-tower/check-ownership.py
if echo "$OUT" | grep -q "代行 win→mac"; then pass "代行逐条打印「代行 win→mac」"; else fail "代行未逐条打印"; fi
if echo "$OUT" | grep -q "原始 owner=win"; then pass "代行行打印原始归属（win）"; else fail "代行行未打印原始归属"; fi
if echo "$OUT" | grep -q "offline_since=2026-09-20"; then pass "代行行打印 offline_since（理由）"; else fail "代行行未打印理由"; fi
if echo "$OUT" | grep -q "授权: 创始人 2026-09-20 口令"; then pass "代行行打印授权出处"; else fail "代行行未打印授权出处"; fi
if echo "$OUT" | grep -q "转抄"; then pass "授权出处标注「转抄」（非创始人原始消息，如实标注）"; else fail "授权出处未标注转抄"; fi
if echo "$OUT" | grep -q "代行 2"; then pass "结论行统计代行件数（代行 2）"; else fail "结论行未统计代行件数"; fi
run_expect 0 "--owner mac + --proxy win=mac: 被代行文件计入 mac" --proxy win=mac tests/agent/x.ts --owner mac
run_expect 1 "--owner win + --proxy win=mac: 代行后不再是 win → 越域 exit 1（不静默）" \
  --proxy win=mac tests/agent/x.ts --owner win

# 反例①: 代行断言未授权 / 与授权不一致 → 不代行 → 仍跨域 exit 1
run_expect 1 "反例①-a: --proxy k3=mac 无 standby 授权 → 仍 exit 1" --proxy k3=mac \
  tests/agent/x.ts scripts/control-tower/check-ownership.py
if echo "$OUT" | grep -q "不生效"; then pass "未授权声明明示「不生效」（不静默）"; else fail "未授权声明未明示"; fi
run_expect 1 "反例①-b: --proxy win=k3 与 standby[win].proxy 不一致 → 仍 exit 1" --proxy win=k3 \
  tests/agent/x.ts scripts/control-tower/check-ownership.py
if echo "$OUT" | grep -q "standby\[win\].proxy=mac"; then pass "不一致声明点名实际授权（mac）"; else fail "不一致声明未点名实际授权"; fi
run_expect 2 "--proxy 语法非法（无 =）→ exit 2（fail-closed）" --proxy winmac tests/agent/x.ts
run_expect 2 "--proxy 与 --emit-codeowners 互斥 → exit 2" --emit-codeowners --proxy win=mac

# 返工 2（D328 三态分离）: --proxy **域值非法**（未知域）= 调用者给坏参数 → exit 2；
#   合法域对但未授权（k3=mac / mac=win）→ 仍 exit 1 + ⚠️ 不生效（红线不动）。
run_expect 2 "返工2-a: --proxy win=bogus（代行域未知）→ exit 2" --proxy win=bogus \
  tests/agent/x.ts scripts/control-tower/check-ownership.py
if echo "$OUT" | grep -q "坏参数"; then pass "坏参数明示分类（不与「越域」混同）"; else fail "坏参数未明示分类"; fi
if echo "$OUT" | grep -q "Traceback"; then fail "坏参数走异常栈（应 fail-closed 受控退出）"; else pass "坏参数受控退出（无 Traceback）"; fi
run_expect 2 "返工2-b: --proxy bogus=mac（域未知）→ exit 2" --proxy bogus=mac tests/agent/x.ts
run_expect 1 "返工2-c 红线: --proxy mac=win（合法域对、未授权）→ 仍 exit 1" --proxy mac=win \
  tests/agent/x.ts scripts/control-tower/check-ownership.py
if echo "$OUT" | grep -q "不生效"; then pass "未授权合法域对仍明示「不生效」（红线不动）"; else fail "未授权合法域对未明示"; fi

echo ""
echo "── 10b. 反例②/③: 删 standby 段（win 回归）/ 段结构非法（fail-closed）──"
"$PYBIN" - "$YAML" "$TMPD" <<'PYEOF'
import pathlib, re, sys
src, tmp = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
t = src.read_text(encoding="utf-8")
m = re.search(r"^standby:", t, re.M)
if not m:
    raise SystemExit("测试前置失败: 真实 ownership.yaml 无 standby 段")
prefix = t[: m.start()]
variants = {
    "sb-nostandby.yaml": "",                                     # 删段 = win 回归（合法 → 严格模式）
    "sb-nomap.yaml": 'standby: ["win"]\n',                       # 段非映射
    "sb-selfproxy.yaml": 'standby:\n  win:\n    proxy: "win"\n    authority: "x"\n    domains: ["win"]\n',
    "sb-noauthority.yaml": 'standby:\n  win:\n    proxy: "mac"\n    domains: ["win"]\n',
    "sb-baddomains.yaml": 'standby:\n  win:\n    proxy: "mac"\n    authority: "x"\n    domains: ["mac"]\n',
    "sb-unknowndomain.yaml": 'standby:\n  winx:\n    proxy: "mac"\n    authority: "x"\n    domains: ["winx"]\n',
    "sb-baddate.yaml": 'standby:\n  win:\n    offline_since: "not-a-date"\n    proxy: "mac"\n    authority: "x"\n    domains: ["win"]\n',      # 返工1: 格式非法
    "sb-badcal.yaml": 'standby:\n  win:\n    offline_since: "2026-13-45"\n    proxy: "mac"\n    authority: "x"\n    domains: ["win"]\n',      # 返工1: 日历越界
    "sb-nodate.yaml": 'standby:\n  win:\n    proxy: "mac"\n    authority: "x"\n    domains: ["win"]\n',                                 # 可选字段缺省 = 合法
}
for name, block in variants.items():
    (tmp / name).write_text(prefix + block, encoding="utf-8")
PYEOF
if [ -f "$TMPD/sb-nostandby.yaml" ] && ! grep -q '^standby:' "$TMPD/sb-nostandby.yaml"; then
  pass "反例② 前置: standby 段已从临时 yaml 移除（真实文件零改动）"
else
  fail "反例② 前置: standby 段未移除"
fi
run_expect 1 "反例② 删 standby 段 → --proxy 不生效 → 恢复跨域 exit 1" --proxy win=mac \
  tests/agent/x.ts scripts/control-tower/check-ownership.py --yaml "$TMPD/sb-nostandby.yaml"
if echo "$OUT" | grep -q "standby 段无"; then pass "删段后 --proxy 明示「standby 段无 win 条目」"; else fail "删段后未明示原因"; fi
run_expect 0 "反例② 删段 + 未传 --proxy 的同域集 → 仍严格单域 exit 0（删段不报错）" \
  src/server.ts src/l3/expert-registry.ts --yaml "$TMPD/sb-nostandby.yaml"
run_expect 2 "反例③-a standby 段非映射 → exit 2" --proxy win=mac tests/agent/x.ts --yaml "$TMPD/sb-nomap.yaml"
run_expect 2 "反例③-b proxy=自身域 → exit 2" --proxy win=mac tests/agent/x.ts --yaml "$TMPD/sb-selfproxy.yaml"
run_expect 2 "反例③-c 缺 authority（无授权出处）→ exit 2" --proxy win=mac tests/agent/x.ts --yaml "$TMPD/sb-noauthority.yaml"
run_expect 2 "反例③-d domains 不含自身域 → exit 2" --proxy win=mac tests/agent/x.ts --yaml "$TMPD/sb-baddomains.yaml"
run_expect 2 "反例③-e standby 未知域 → exit 2" --proxy win=mac tests/agent/x.ts --yaml "$TMPD/sb-unknowndomain.yaml"
# 返工 1: offline_since **字段值**也钉死 —— 坏值会被 B2 原样织进「理由」串 = K3 审计链不可信
run_expect 2 "返工1-a offline_since=not-a-date（格式非法）→ exit 2" --proxy win=mac \
  tests/agent/x.ts --yaml "$TMPD/sb-baddate.yaml"
if echo "$OUT" | grep -q "YYYY-MM-DD"; then pass "坏日期点名要求格式（YYYY-MM-DD）"; else fail "坏日期未点名格式要求"; fi
if echo "$OUT" | grep -q "Traceback"; then fail "坏日期走异常栈（应 fail-closed 受控退出）"; else pass "坏日期受控退出（无 Traceback）"; fi
run_expect 2 "返工1-b offline_since=2026-13-45（日历越界）→ exit 2" --proxy win=mac \
  tests/agent/x.ts --yaml "$TMPD/sb-badcal.yaml"
if echo "$OUT" | grep -q "Traceback"; then fail "越界日期走异常栈（应 fail-closed 受控退出）"; else pass "越界日期受控退出（无 Traceback）"; fi
run_expect 0 "返工1-c offline_since 缺省（可选字段）→ 仍合法可代行" --proxy win=mac \
  tests/agent/x.ts --owner mac --yaml "$TMPD/sb-nodate.yaml"
if echo "$OUT" | grep -q "offline_since=未记录"; then pass "缺省 offline_since 在理由串显式标「未记录」（不编造）"; else fail "缺省 offline_since 未显式标注"; fi
run_expect 0 "原 yaml 复测仍可代行（未污染真实文件）" --proxy win=mac tests/agent/x.ts --owner mac

echo ""
echo "── 11. D911 切片 B B5: 目录无显式规则 → 显式提示（不新增阻断）──"
run_expect 1 "B5 无显式规则的目录 + 跨域 → exit 1" tests/agent/x.ts scripts/control-tower/check-ownership.py
if echo "$OUT" | grep -q "B5 目录未登记"; then pass "B5 显式点名「B5 目录未登记」"; else fail "B5 未点名目录未登记"; fi
if echo "$OUT" | grep -q "tests/agent"; then pass "B5 点名具体目录 tests/agent"; else fail "B5 未点名具体目录"; fi
if echo "$OUT" | grep -q "没有显式规则"; then pass "B5 明说真错是「这些目录没有显式规则」（非「变更跨域」）"; else fail "B5 未明说真错"; fi
if echo "$OUT" | grep -q "新目录没登记"; then fail "返工3 回归: 文案仍把既有目录称「新目录」"; else pass "返工3: 文案不再用「新目录」措辞（改「无显式规则的目录」）"; fi
if echo "$OUT" | grep -q "子目录：无显式规则"; then pass "返工3: 子目录按层级标注"; else fail "返工3: 子目录未按层级标注"; fi
if echo "$OUT" | grep -q "ownership.yaml"; then pass "B5 给出修复路径（ownership.yaml 补登记）"; else fail "B5 未给修复指引"; fi
run_expect 1 "返工3 顶层目录（tests/ 散装文件）→ 标「顶层目录」不叫新目录" \
  tests/circular-dependency.test.ts docs/README.md scripts/control-tower/check-ownership.py
if echo "$OUT" | grep -q "顶层目录：无显式规则"; then pass "返工3: 顶层目录按层级标注"; else fail "返工3: 顶层目录未标注"; fi
run_expect 0 "B5 不新增阻断: 目录未登记路径 + 同域文件 → 仍 exit 0" docs/foo/y.md src/server.ts
if echo "$OUT" | grep -q "B5 目录未登记"; then pass "B5 在 exit 0 路径上也显式提示（不静默）"; else fail "B5 通过路径未提示"; fi
run_expect 0 "B5 不误报已登记目录（docs/synova/dispatch → mac）" \
  docs/synova/dispatch/D911-门禁三缺陷根治-20260922.md --owner mac
if echo "$OUT" | grep -q "B5 目录未登记"; then fail "B5 对已登记目录误报"; else pass "B5 对已登记目录零误报"; fi
run_expect 0 "B5 不误报 tests/control-tower/**（已登记）" tests/control-tower/check-ownership.test.sh --owner mac
if echo "$OUT" | grep -q "B5 未登记目录"; then fail "B5 对 tests/control-tower 误报"; else pass "B5 对 tests/control-tower 零误报"; fi

echo ""
echo "── 12. D911 产物契约: standby 不是 CODEOWNERS 的输入（单点开关，无双写点）──"
"$PYBIN" "$TOOL" --emit-codeowners > "$TMPD/co-real.txt" 2> "$TMPD/co-real.err"; EMIT_A=$?
"$PYBIN" "$TOOL" --emit-codeowners --yaml "$TMPD/sb-nostandby.yaml" > "$TMPD/co-nostandby.txt" 2> "$TMPD/co-nostandby.err"; EMIT_B=$?
if [ "$EMIT_A" = 0 ] && [ "$EMIT_B" = 0 ]; then
  pass "两次 --emit-codeowners 均 exit 0（stderr 落文件，未吞错）"
else
  fail "二次生成失败（EMIT_A=$EMIT_A EMIT_B=$EMIT_B）: $(head -3 "$TMPD/co-real.err" "$TMPD/co-nostandby.err")"
fi
if grep -q "standby" "$TMPD/co-real.txt"; then
  fail "CODEOWNERS 含 standby 字样（standby 成了双写点 → win 回归要改两处）"
else
  pass "CODEOWNERS 不含 standby 字样（standby 单一事实源只在 ownership.yaml）"
fi
if diff -q "$TMPD/co-real.txt" "$TMPD/co-nostandby.txt" >/dev/null 2>&1; then
  pass "反证: 删 standby 段后 --emit-codeowners 输出逐字节不变（standby 不是生成输入）"
else
  fail "删 standby 段后 CODEOWNERS 生成结果变了（双写点）"
  diff "$TMPD/co-real.txt" "$TMPD/co-nostandby.txt" | head -5 >&2
fi
# standby 段不参与 rules 求值: 同一文件的判定在「有/无 standby」两版 yaml 下必须逐字节一致
OUT_A="$("$PYBIN" "$TOOL" --owner win tests/agent/x.ts --yaml "$YAML" 2>&1)"; EA=$?
OUT_B="$("$PYBIN" "$TOOL" --owner win tests/agent/x.ts --yaml "$TMPD/sb-nostandby.yaml" 2>&1)"; EB=$?
if [ "$EA" = 0 ] && [ "$EB" = 0 ] && [ "$OUT_A" = "$OUT_B" ]; then
  pass "standby 段不参与 rules 求值（有/无该段 → 归属判定与输出逐字节一致）"
else
  fail "standby 段参与了 rules 求值（EA=$EA EB=$EB）"
fi
if grep -qE '^(mac|win|k3)' "$TMPD/co-real.txt" | grep -qE '代行|proxy'; then
  fail "归属行混入代行语义"
else
  pass "归属行无代行语义（生成产物纯归属）"
fi

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
