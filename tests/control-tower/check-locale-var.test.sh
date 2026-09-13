#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# check-locale-var.test.sh — D738 `$VAR` 紧贴非 ASCII 常驻扫描测试
#
# 覆盖（铁律 48: 正常 / 降级 / 边界）:
#   1. 正常   — 干净文件 → exit 0
#   2. 命中   — `$VAR（` → exit 1 + 逐条点名 file:line
#   3. 反向验证 — 造 `$VAR（` 必红 → 改成 `${VAR}` 必绿（证明扫的是真东西）
#   4. 边界   — `${VAR}`（已加花括号）不报 / `$VAR"`（ASCII）不报 / 全行注释不报
#   5. 全仓模式 — 无参数 → 扫 scripts/ + tests/ 并输出扫描文件数
#   6. 接线   — pre-commit 真调用本扫描器（铁律 0-2 WIRE CHECK）
#
# 零真实仓库污染: 全部在 mktemp 沙箱里造文件；全仓模式只读。
# ═══════════════════════════════════════════════════════════════════════════════
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TOOL="$REPO_DIR/scripts/control-tower/check-locale-var.sh"
PC="$REPO_DIR/scripts/pre-commit-check.sh"

TMPD="$(mktemp -d)"
trap 'rm -rf "$TMPD"' EXIT

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
OUT=""; RC=0

echo "═══════════════════════════════════════════════════════════"
echo "  D738 — \$VAR 紧贴非 ASCII 扫描"
echo "═══════════════════════════════════════════════════════════"

echo ""
echo "── 1. 正常: 干净文件 → exit 0 ──"
printf '#!/bin/bash\nset -uo pipefail\nN=1\necho "结果（${N}）"\n' > "$TMPD/clean.sh"
OUT="$(bash "$TOOL" "$TMPD/clean.sh" 2>&1)"; RC=$?
[ "$RC" = 0 ] && pass "干净文件 exit 0" || fail "干净文件 exit=${RC}（应 0）"

echo ""
echo "── 2. 命中: 未加花括号的 VAR 紧跟全角括号 → exit 1 + 点名 ──"
printf '#!/bin/bash\nset -uo pipefail\nN=1\necho "结果（%s（双层））"\n' '$N' > "$TMPD/bad.sh"
OUT="$(bash "$TOOL" "$TMPD/bad.sh" 2>&1)"; RC=$?
[ "$RC" = 1 ] && pass "命中 → exit 1" || fail "命中 exit=${RC}（应 1）"
echo "$OUT" | grep -q "bad.sh:4" && pass "点名 file:line" || fail "未点名 file:line: $OUT"
echo "$OUT" | grep -q '\$N' && pass "点名变量名 \$N" || fail "未点名变量名"

echo ""
echo "── 3. 反向验证: 改回 \${VAR} → 必绿 ──"
printf '#!/bin/bash\nset -uo pipefail\nN=1\necho "结果（${N}）"\n' > "$TMPD/fixed.sh"
OUT="$(bash "$TOOL" "$TMPD/fixed.sh" 2>&1)"; RC=$?
[ "$RC" = 0 ] && pass "反向验证: 加花括号后 exit 0（证明扫的是真东西）" || fail "加花括号后 exit=${RC}（应 0）"
# 同一文件再改回缺陷形态 → 必须重新变红
printf '#!/bin/bash\nset -uo pipefail\nN=1\necho "结果（%s）"\n' '$N' > "$TMPD/fixed.sh"
OUT="$(bash "$TOOL" "$TMPD/fixed.sh" 2>&1)"; RC=$?
[ "$RC" = 1 ] && pass "反向验证: 改回缺陷形态立刻变红（可复现）" || fail "改回后 exit=${RC}（应 1）"

echo ""
echo "── 4. 边界 ──"
# 全行注释（首个非空白字符为 #）→ 跳过（与 pre-commit「as any 跳过注释行」同惯例）
printf '#!/bin/bash\nset -uo pipefail\nN=1\n# 这里是全行注释，%s（ 不算\necho "ok"\n' '$N' > "$TMPD/cmt.sh"
OUT="$(bash "$TOOL" "$TMPD/cmt.sh" 2>&1)"; RC=$?
[ "$RC" = 0 ] && pass "全行注释不报（与 as any 跳过注释行同惯例）" || fail "全行注释被误报 exit=${RC}"
# 已文档化的边界: **行内注释**（行尾 # 之后）不做识别 —— bash 无法可靠切分引号内的 #
printf '#!/bin/bash\nset -uo pipefail\nN=1\necho "（${N}）"  # 行内注释 %s（ 仍会被扫到\n' '$N' > "$TMPD/inline.sh"
OUT="$(bash "$TOOL" "$TMPD/inline.sh" 2>&1)"; RC=$?
[ "$RC" = 1 ] && pass "行内注释仍被扫（已文档化的边界：只跳全行注释）" || fail "行内注释行为变了 exit=${RC}（应 1，与脚本头「约定」一致）"
printf '#!/bin/bash\nset -uo pipefail\nN=1\necho "$N" > /dev/null\n' > "$TMPD/ascii.sh"
OUT="$(bash "$TOOL" "$TMPD/ascii.sh" 2>&1)"; RC=$?
[ "$RC" = 0 ] && pass "\$VAR 紧跟 ASCII（双引号）不报" || fail "ASCII 场景误报 exit=${RC}"
OUT="$(bash "$TOOL" "$TMPD/does-not-exist.sh" 2>&1)"; RC=$?
[ "$RC" = 0 ] && pass "不存在的文件 → 跳过，exit 0（无命中）" || fail "不存在文件 exit=${RC}"
# 显式传入的文件**一律扫**（不做 bash 判定）—— 与 pre-commit 把变更 .sh 传进来的用法一致
printf '不是 bash\n%s（\n' '$N' > "$TMPD/notbash.txt"
OUT="$(bash "$TOOL" "$TMPD/notbash.txt" 2>&1)"; RC=$?
[ "$RC" = 1 ] && pass "显式传入的文件一律扫、不看扩展名（命中即 1）" || fail "显式传入非 bash 文件 exit=${RC}（应 1）"

echo ""
echo "── 5. 全仓模式（无参数）──"
OUT="$(bash "$TOOL" 2>&1)"; RC=$?
if echo "$OUT" | grep -q "扫描 bash 文件:"; then pass "全仓模式输出扫描文件数"; else fail "全仓模式未报扫描数"; fi
if [ "$RC" = 1 ] || [ "$RC" = 0 ]; then pass "全仓模式退出码合法（0/1）: ${RC}"; else fail "全仓模式 exit=${RC}（应 0/1，2=执行失败）"; fi

echo ""
echo "── 6. 接线（铁律 0-2 WIRE CHECK）──"
grep -q "check-locale-var.sh" "$PC" && pass "pre-commit 真调用本扫描器（非死代码）" || fail "pre-commit 未调用（死代码）"

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
