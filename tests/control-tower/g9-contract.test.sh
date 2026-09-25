#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# g9-contract.test.sh — D962-B2 组 9（契约门禁 D257）组级测试
#
# 覆盖矩阵（铁律 48: 正常/降级/边界 + 改坏即红正样本）:
#   正常 — 契约声明产出在暂存区 → 组 9 无告警（soft 不触发）
#   红   — 契约声明 src/xxx.ts 但暂存区无该文件 → 组 9 软提示点名"不在暂存区"
#          （改坏即红: 判定体被删则结构断言红; 判定失灵则行为断言红）
#   降级 — .codex/contracts 不存在（当前生产态）→ 组 9 守卫跳过（不误杀）
#   边界 — 契约目录存在但为空 → 跳过; SYNO_CI=1 时软提示转硬（结构断言）
#
# 注入缝（零真实仓库污染 + 不触发 CT-34 纯文档早退）:
#   SYNO_GIT_CACHED_NAMES/ALL_NAMES 注入暂存 src 探针文件名; SYNO_GATE_HITS_LOG
#   与 SYNO_EXEMPT_LOG 指向 /tmp; 契约夹具放 .codex/contracts/（untracked, trap 清理）。
#   平台中立: 无 sed -i / 无 grep -P / UTF-8 头块 / PYBIN 三级探测。
#   已知边界（D962-B2 报队长）: 组 9 判定只在非纯文档提交路径执行（CT-34 早退豁免 12 组）。
# ═══════════════════════════════════════════════════════════════════════════════
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PRE_COMMIT="$REPO_DIR/scripts/pre-commit-check.sh"
TMP_DIR="$(mktemp -d /tmp/g9-contract-tests.XXXXXX)"
CONTRACT_DIR="$REPO_DIR/.codex/contracts"
_cleanup() { rm -rf "$TMP_DIR"; rm -rf "$CONTRACT_DIR"; }
trap _cleanup EXIT

PYBIN=""
for _c in python3 python "$(command -v py 2>/dev/null || true)"; do
  if command -v "$_c" >/dev/null 2>&1; then PYBIN="$_c"; break; fi
done

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_contains() { if echo "$1" | grep -qF "$2"; then pass "$3"; else fail "$3 — 未找到: $2"; fi; }

# 统一注入环境（_SANDBOX=1 隔离真实暂存区; src 探针避开 CT-34 纯文档早退）
# 平台缺陷登记（D962-B2 报队长→A）: pre-commit L1099 组 9 判定体用裸 `python`
# （违 PLATFORM-CHECKLIST #1 三级探测）。本机无 python 别名 → DECLARED 恒空 →
# 判定静默空转。测试内以 PATH shim（python→PYBIN）令判定体真正执行，不改 pre-commit。
if ! command -v python >/dev/null 2>&1; then
  mkdir -p "$TMP_DIR/bin"
  printf '#!/bin/sh\nexec %s "$@"\n' "$PYBIN" > "$TMP_DIR/bin/python"
  chmod +x "$TMP_DIR/bin/python"
fi
run_pc() {
  ( cd "$REPO_DIR" && PATH="$TMP_DIR/bin:${PATH:-/usr/bin:/bin}" \
      SYNO_GIT_CACHED_NAMES="src/g9-probe.ts" \
      SYNO_GIT_CACHED_ADDED_NAMES="src/g9-probe.ts" \
      SYNO_GIT_CACHED_ALL_NAMES="src/g9-probe.ts" \
      SYNO_GATE_HITS_LOG="$TMP_DIR/hits.jsonl" \
      SYNO_EXEMPT_LOG="$TMP_DIR/exempt.log" \
      bash "$PRE_COMMIT" 2>&1 ) || true
}

echo "═══════════════════════════════════════════════════════════"
echo "  D962 组 9 组级测试: 契约门禁 (D257) (PYBIN=$PYBIN)"
echo "═══════════════════════════════════════════════════════════"
echo ""

echo "── 1. 降级/生产态: 契约目录不存在 → 组 9 守卫跳过 ──"
OUT=$(run_pc)
if echo "$OUT" | grep -q "组 9/13"; then pass "组 9 段被执行（目录缺失守卫生效）"; else fail "组 9 段未出现（接线断或被早退）"; fi
if echo "$OUT" | grep -q "契约门禁: 声明产出须在暂存区.*不在暂存区"; then fail "目录缺失时误报"; else pass "目录缺失不误杀（守卫正确）"; fi
echo ""

echo "── 2. 红分支: 契约声明产出不在暂存区 → 软提示点名 ──"
mkdir -p "$CONTRACT_DIR"
printf '[{"filePath": "src/declared-but-not-staged.ts"}]\n' > "$CONTRACT_DIR/g9-fixture.json"
OUT=$(run_pc)
if echo "$OUT" | grep -q "组 9/13"; then pass "组 9 段被执行"; else fail "组 9 段未出现"; fi
assert_contains "$OUT" "declared-but-not-staged.ts" "缺失产出被点名（改坏即红正样本）"
if echo "$OUT" | grep -q "契约门禁: 声明产出须在暂存区" && echo "$OUT" | grep -q "不在暂存区"; then pass "组 9 软提示触发（本地软，CI 权威）"; else fail "组 9 软提示未真正触发（此前命中可能是通过行的误匹配）"; fi
echo ""

echo "── 3. 正常路径: 声明产出在暂存区 → 无契约告警 ──"
printf '[{"filePath": "src/g9-probe.ts"}]\n' > "$CONTRACT_DIR/g9-fixture.json"
OUT=$(run_pc)
if echo "$OUT" | grep -q "组 9/13"; then pass "组 9 段被执行"; else fail "组 9 段未出现"; fi
if echo "$OUT" | grep -q "契约门禁: 声明产出须在暂存区.*src/"; then fail "已声明产出被误报"; else pass "声明产出在暂存区 → 无告警"; fi
echo ""

echo "── 4. 边界: 契约目录存在但为空 → 跳过 ──"
rm -f "$CONTRACT_DIR/g9-fixture.json"
OUT=$(run_pc)
if echo "$OUT" | grep -q "契约门禁: 声明产出须在暂存区.*不在暂存区"; then fail "空目录误报"; else pass "空契约目录不触发判定（ls -A 守卫）"; fi
echo ""

echo "── 5. 改坏即红结构断言 ──"
if grep -q 'CONTRACT_DIR="\$ROOT/.codex/contracts"' "$PRE_COMMIT"; then pass "CONTRACT_DIR 判定源存在"; else fail "CONTRACT_DIR 接线断"; fi
if grep -q 'soft_check "契约门禁: 声明产出须在暂存区"' "$PRE_COMMIT"; then pass "组 9 soft_check 判定体存在"; else fail "组 9 判定体缺失"; fi
if grep -q "SYNO_CI" "$PRE_COMMIT"; then pass "SYNO_CI 软转硬机制存在（D516 CI 权威）"; else fail "软转硬机制缺失"; fi
if echo "$OUT" | grep -q "组 9/13"; then pass "组 9 段标题可观测（输出可见性）"; else fail "组 9 输出不可见"; fi
echo ""

echo "═══════════════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then echo "  全部通过: $PASS ✅ / $FAIL ❌"; exit 0; else echo "  失败: $PASS ✅ / $FAIL ❌" >&2; exit 1; fi
