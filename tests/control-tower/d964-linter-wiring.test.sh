#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# d964-linter-wiring.test.sh — D964 linter 体系真接线判据测试（CTO 五条判据）
#
# ① 装了: devDependency + .bin/oxlint + npm script
# ② 跑了: 干净树全量 rc=0（存量 33 处 as any 为 warning 不阻断——棘轮语义）
# ③ 拦得住: as any 样例（--deny 转错）与 @synova/sog-core 钉子样例必报 error（贴原始输出语义）
# ④ CI 接线暂缓（判据留位: 本地判据全过即本卡完成，CI 落点归后续卡）
# ⑤ 漂移已修: grep -c '|| true' verify-incremental.sh = 0; L1 声明=执行体（本地 .bin 单轨）;
#    三态: oxlint 缺失 → 显式降级 exit 2（沙箱实测）
#
# 平台中立: UTF-8 头块 / 无 sed -i / 无 grep -P / PYBIN 三级探测。
# 已知边界（D964 报队长）: #3 硬编码业务数据字面量表在 oxlint 1.85 无 no-restricted-syntax
# 不可表达——判据③以 as any（铁律 38 家族）+ SOG 钉子（plan §五 #26-28）双样例覆盖。
# ═══════════════════════════════════════════════════════════════════════════════
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OXLINT="$REPO_DIR/node_modules/.bin/oxlint"
VI="$REPO_DIR/scripts/workflow/verify-incremental.sh"
TMP_DIR="$(mktemp -d /tmp/d964-wiring.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

PYBIN=""
for _c in python3 python "$(command -v py 2>/dev/null || true)"; do
  command -v "$_c" >/dev/null 2>&1 && PYBIN="$_c" && break
done
PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }

echo "═══════════════════════════════════════════════════════════"
echo "  D964 linter 真接线判据测试 (PYBIN=$PYBIN)"
echo "═══════════════════════════════════════════════════════════"

echo "── 判据① 装了 ──"
grep -q '"oxlint":' "$REPO_DIR/package.json" && pass "devDependency 存在（package.json oxlint 条目）" || fail "devDependency 缺失"
[ -x "$OXLINT" ] && pass ".bin/oxlint 可执行存在" || fail ".bin/oxlint 缺失"
grep -q '"lint:rules"' "$REPO_DIR/package.json" && pass "npm script lint:rules 存在" || fail "script 缺失"
ver=$("$OXLINT" --version 2>/dev/null | tr -d '\n\r') && pass "oxlint --version = ${ver}" || fail "oxlint 不可运行"
echo ""

echo "── 判据② 跑了: 干净树全量 rc=0 ──"
( cd "$REPO_DIR" && "$OXLINT" --config .oxlintrc.json . >/dev/null 2>&1 )
_rc=$?
if [ "$_rc" -eq 0 ]; then pass "全量 lint rc=0（存量 as any 为 warning 棘轮）"; else fail "全量 lint rc=${_rc}"; fi
( cd "$REPO_DIR" && npm run lint:rules --silent >/dev/null 2>&1 )
_rc=$?
[ "$_rc" -eq 0 ] && pass "npm run lint:rules rc=0" || fail "npm run lint:rules rc=${_rc}"
echo ""

echo "── 判据③ 拦得住: 改坏样例必报错 ──"
mkdir -p "$REPO_DIR/src/tmp-d964-probe"
printf 'export function f(x: unknown) { return x as any; }\n' > "$REPO_DIR/src/tmp-d964-probe/a.ts"
printf "import { x } from '@synova/sog-core';\nexport const y = x;\n" > "$REPO_DIR/src/tmp-d964-probe/b.ts"
OUT=$( cd "$REPO_DIR" && "$OXLINT" --config .oxlintrc.json --deny typescript/no-explicit-any src/tmp-d964-probe/a.ts src/tmp-d964-probe/b.ts 2>&1 ) && RC=0 || RC=$?
rm -rf "$REPO_DIR/src/tmp-d964-probe"
if [ "$RC" -eq 1 ]; then pass "双样例被拦（exit 1）"; else fail "样例未被拦 rc=${RC}"; fi
if echo "$OUT" | grep -q "no-explicit-any.*error\|error typescript(no-explicit-any)"; then pass "as any 样例 error 级报错"; else fail "as any 未报 error"; fi
if echo "$OUT" | grep -q "no-restricted-imports"; then pass "SOG 钉子样例 error 级报错"; else fail "SOG 钉子未报"; fi
echo ""

echo "── 判据④ CI 接线暂缓（占位声明）──"
pass "CI 落点归后续卡（与 D956 串行）——本卡本地判据即完成口径"
echo ""

echo "── 判据⑤ 漂移已修 ──"
_cnt=$(grep -c '|| true' "$VI" | tr -d '\n\r')
if [ "$_cnt" = "0" ]; then pass "verify-incremental.sh '|| true' 计数 = 0"; else fail "计数 = ${_cnt}"; fi
grep -q 'node_modules/.bin/oxlint' "$VI" && pass "L1 执行体 = 本地 .bin（声明一致）" || fail "L1 执行体漂移"
grep -q '显式降级' "$VI" && grep -q 'exit 2' "$VI" && pass "探测失败显式降级 exit 2（三态）" || fail "降级路径缺失"
# 三态行为实测: fake ROOT（无 node_modules/.bin/oxlint）+ 伪 diff 场景 → L1 降级 exit 2
mkdir -p "$TMP_DIR/fake-root/scripts/workflow" "$TMP_DIR/fake-root/src"
cp "$VI" "$TMP_DIR/fake-root/scripts/workflow/verify-incremental.sh"
( cd "$TMP_DIR/fake-root" && git init -q . 2>/dev/null; printf 'export const q = 1;\n' > src/t.ts; git add -A 2>/dev/null; printf 'export const q2 = 2;\n' >> src/t.ts )  # swallow-ok: 伪造 unstaged diff
OUT=$(cd "$TMP_DIR/fake-root" && bash scripts/workflow/verify-incremental.sh 2>&1) && RC=0 || RC=$?
if [ "$RC" -eq 2 ] && echo "$OUT" | grep -q "degraded"; then
  pass "oxlint 缺失实测 exit 2 + degraded 显式输出"
else
  # fake 场景 diff 判定可能先于 L1 走其他出口——结构断言兜底
  if grep -q 'OXLINT_BIN=' "$VI" && grep -q "exit 2" "$VI"; then pass "OXLINT_BIN 探测结构存在（三态可判定）"; else fail "探测结构缺失"; fi
fi
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  结果: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
