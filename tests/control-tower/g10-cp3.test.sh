#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# g10-cp3.test.sh — D962-B2 组 10（V3 CP3 流水线健康度 D260）组级测试
#
# 覆盖矩阵（铁律 48: 正常/降级/边界 + 改坏即红正样本）:
#   正常 — 无 brief 变更 → G10/G11 跳过路径可观测（soft_pass 跳过输出）
#   边界 — criteria-code-map.json 不存在 → 显式跳过（结构断言: 判定体守卫存在）
#   降级 — CRITERIA 解析失败容忍（结构断言: || true 守卫 + soft_pass 跳过）
#   改坏即红 — G10/G11 判定体/CRITERIA 提取/soft_pass 三态语义结构断言
#
# ⚠ 已知缺陷绊线（D962-B2 报队长→A 待修）: pre-commit L1126 `CHANGED_FILES`
# 全脚本仅此一处使用、零赋值（set +e 空变量）→ G10/G11 红分支恒不可达（死分支）。
# 本测试断言注入 brief 后仍走跳过路径（死分支现状快照）。A 补 CHANGED_FILES 赋值后
# 本断言将翻红——即为更新为真实红分支行为断言的物理提醒（绊线设计，非掩盖）。
#
# 平台中立: 无 sed -i / 无 grep -P / UTF-8 头块 / PYBIN 三级探测（含 python shim，
# L1132 CRITERIA_GLOBS 用裸 python，同 g9 登记的 PLATFORM-CHECKLIST #1 缺陷）。
# ═══════════════════════════════════════════════════════════════════════════════
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PRE_COMMIT="$REPO_DIR/scripts/pre-commit-check.sh"
TMP_DIR="$(mktemp -d /tmp/g10-cp3-tests.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

PYBIN=""
for _c in python3 python "$(command -v py 2>/dev/null || true)"; do
  if command -v "$_c" >/dev/null 2>&1; then PYBIN="$_c"; break; fi
done
if ! command -v python >/dev/null 2>&1; then
  mkdir -p "$TMP_DIR/bin"
  printf '#!/bin/sh\nexec %s "$@"\n' "$PYBIN" > "$TMP_DIR/bin/python"
  chmod +x "$TMP_DIR/bin/python"
fi

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_contains() { if echo "$1" | grep -qF "$2"; then pass "$3"; else fail "$3 — 未找到: $2"; fi; }

run_pc() { # $1 = 注入的暂存文件名列表（换行分隔）
  ( cd "$REPO_DIR" && PATH="$TMP_DIR/bin:${PATH:-/usr/bin:/bin}" \
      SYNO_GIT_CACHED_NAMES="$1" \
      SYNO_GIT_CACHED_ADDED_NAMES="$1" \
      SYNO_GIT_CACHED_ALL_NAMES="$1" \
      SYNO_GATE_HITS_LOG="$TMP_DIR/hits.jsonl" \
      SYNO_EXEMPT_LOG="$TMP_DIR/exempt.log" \
      bash "$PRE_COMMIT" 2>&1 ) || true
}

echo "═══════════════════════════════════════════════════════════"
echo "  D962 组 10 组级测试: V3 CP3 流水线健康度 (PYBIN=$PYBIN)"
echo "═══════════════════════════════════════════════════════════"
echo ""

echo "── 1. 正常路径: 无 brief 变更 → G10/G11 跳过可观测 ──"
OUT=$(run_pc "src/g10-probe.ts")
if echo "$OUT" | grep -q "组 10/13"; then pass "组 10 段被执行"; else fail "组 10 段未出现"; fi
if echo "$OUT" | grep -qE "G10.*(跳过|无 task brief)"; then pass "G10 无 brief 跳过路径可观测"; else fail "G10 跳过路径不可见"; fi
if echo "$OUT" | grep -qE "G11.*(跳过|不存在)"; then pass "G11 无 brief 跳过路径可观测"; else fail "G11 跳过路径不可见"; fi
echo ""

echo "── 2. 死分支现状快照（绊线: A 修复 CHANGED_FILES 赋值后本断言翻红）──"
# 注入 brief 文件名到全部 SYNO_GIT_CACHED_* 注入缝。若 CHANGED_FILES 已正确赋值
# （来源 = GIT_CACHED_ALL_NAMES 族），G10 将进入 CRITERIA 解析；现状是恒跳过。
BRIEF_NAME=".claude/task-briefs/2026-09-25-d962-g10-probe.md"
# 注：不落盘 brief 夹具——判定体读 $ROOT/$BRIEF_FILE，而 BRIEF_FILE 恒空（死分支），
# brief 实体不会被读取；仅注入文件名验证 G10 是否接线到暂存清单，零仓库污染。
OUT=$(run_pc "src/g10-probe.ts
$BRIEF_NAME")
if echo "$OUT" | grep -qE "G10: 条件区域检查通过|G10: 条件.*不匹配"; then
  fail "CHANGED_FILES 已接线（死分支已修）——请把本节改为真实红分支行为断言（删本绊线）"
elif echo "$OUT" | grep -qE "G10.*(跳过|无 task brief)"; then
  pass "现状登记: 注入 brief 仍跳过（CHANGED_FILES 未赋值死分支，D962-B2 已报队长→A）"
else
  fail "G10 输出形态未知——请人工核查"
fi
echo ""

echo "── 3. 改坏即红结构断言 ──"
if grep -q '#CRITERIA\[[:space:]\]\[\[:space:]\]\*' "$PRE_COMMIT" || grep -q '#CRITERIA' "$PRE_COMMIT"; then
  pass "G10 CRITERIA 提取判定体存在"
else
  fail "G10 CRITERIA 判定体缺失"
fi
if grep -q "criteria-code-map.json 不存在" "$PRE_COMMIT"; then pass "criteria-map 缺失降级路径显式（边界）"; else fail "criteria-map 缺失路径缺失"; fi
if grep -q 'warn_check "G11: 声明的端到端验收但无测试文件"' "$PRE_COMMIT"; then pass "G11 判定体存在（warn 语义）"; else fail "G11 判定体缺失"; fi
if grep -q "soft_pass" "$PRE_COMMIT"; then pass "soft_pass 三态语义函数存在"; else fail "soft_pass 缺失"; fi
if grep -q "SYNO_CI" "$PRE_COMMIT"; then pass "SYNO_CI 软转硬机制存在（D542 CI 转硬）"; else fail "软转硬机制缺失"; fi
echo ""

echo "═══════════════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then echo "  全部通过: $PASS ✅ / $FAIL ❌"; exit 0; else echo "  失败: $PASS ✅ / $FAIL ❌" >&2; exit 1; fi
