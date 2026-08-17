#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# ct-test-gate.test.sh — U7/CT-40 控制塔脚本测试配对门禁测试
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常 — 无控制塔脚本变更 → exit 0 跳过；非控制塔脚本 → exit 0 跳过；有配对且绿 → exit 0
#   降级 — 配对测试红 → exit 1
#   边界 — 缺配对测试 → exit 1
#   接线 — ct-test-gate.sh 在 pre-commit-check.sh 中被调用（铁律 0-2 WIRE CHECK）
# 沙箱: SYNO_TEST_ARM=1 + SYNO_CT_STAGED 注入暂存文件；临时脚本/测试 trap 强制清理.
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$REPO/scripts/control-tower/ct-test-gate.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

# 临时文件统一清理
TMPS="$REPO/scripts/control-tower/tmp-u7-no-pair.sh $REPO/scripts/control-tower/tmp-u7-red.sh $REPO/tests/control-tower/tmp-u7-red.test.sh"
cleanup() { rm -f $TMPS; }
trap cleanup EXIT

echo "=== U7/CT-40 控制塔脚本测试配对门禁测试 ==="

# ── 接线: ct-test-gate.sh 在 pre-commit-check.sh 中被真实调用（非仅文件存在）──
if grep -q "ct-test-gate.sh" "$REPO/scripts/pre-commit-check.sh"; then
  ok "接线: ct-test-gate.sh 已接入 pre-commit-check.sh"
else
  no "接线: ct-test-gate.sh 未接入 pre-commit"
fi

# ── 正常 1: 无控制塔脚本变更 → exit 0 跳过 ──
SYNO_TEST_ARM=1 SYNO_CT_STAGED="" bash "$GATE" >/dev/null 2>&1
rc=$?
[ "$rc" -eq 0 ] && ok "无变更 → exit 0 跳过" || no "无变更应 exit 0, 实际 $rc"

# ── 正常 2: 非控制塔脚本变更（src/ 产品代码）→ exit 0 跳过 ──
SYNO_TEST_ARM=1 SYNO_CT_STAGED="src/agent/foo.ts" bash "$GATE" >/dev/null 2>&1
rc=$?
[ "$rc" -eq 0 ] && ok "非控制塔脚本 → exit 0 跳过" || no "非控制塔脚本应 exit 0, 实际 $rc"

# ── 正常 3: 有配对测试且绿（alloc-task-id.sh 基线绿）→ exit 0 ──
SYNO_TEST_ARM=1 SYNO_CT_STAGED="scripts/control-tower/alloc-task-id.sh" bash "$GATE" >/dev/null 2>&1
rc=$?
[ "$rc" -eq 0 ] && ok "有配对且绿 → exit 0" || no "有配对且绿应 exit 0, 实际 $rc"

# ── 边界: 缺配对测试 → exit 1（临时脚本无配对）──
echo "#!/bin/bash" > "$REPO/scripts/control-tower/tmp-u7-no-pair.sh"
SYNO_TEST_ARM=1 SYNO_CT_STAGED="scripts/control-tower/tmp-u7-no-pair.sh" bash "$GATE" >/dev/null 2>&1
rc=$?
rm -f "$REPO/scripts/control-tower/tmp-u7-no-pair.sh"
[ "$rc" -eq 1 ] && ok "缺配对测试 → exit 1" || no "缺配对测试应 exit 1, 实际 $rc"

# ── 降级: 配对测试红 → exit 1（临时脚本 + 会失败的配对测试）──
echo "#!/bin/bash" > "$REPO/scripts/control-tower/tmp-u7-red.sh"
printf '#!/bin/bash\nexit 1\n' > "$REPO/tests/control-tower/tmp-u7-red.test.sh"
SYNO_TEST_ARM=1 SYNO_CT_STAGED="scripts/control-tower/tmp-u7-red.sh" bash "$GATE" >/dev/null 2>&1
rc=$?
rm -f "$REPO/scripts/control-tower/tmp-u7-red.sh" "$REPO/tests/control-tower/tmp-u7-red.test.sh"
[ "$rc" -eq 1 ] && ok "配对测试红 → exit 1" || no "配对测试红应 exit 1, 实际 $rc"

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
