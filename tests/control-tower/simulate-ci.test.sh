#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# simulate-ci.test.sh — D521/工具2: push 前 CI 等价模拟脚本
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常 — 注入全绿桩 → exit 0
#   失败 — 注入失败桩（模拟"本地绿 CI 红"的环境差异类错误）→ exit 1 + 点名
#   降级 — pre-commit 缺失 → exit 2（D328 fail-closed，不当作通过）
#   接线 — CI 等价环境变量（SYNO_CI/SYNO_DIFF_BASE/GITHUB_ACTIONS）+ ci.yml 清单单源提取
# 沙箱: SYNO_SIM_PRECOMMIT 注入桩脚本（零真实仓库门禁执行）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SIM="$REPO/scripts/control-tower/simulate-ci.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT

echo "=== D521 工具2: simulate-ci ==="

# ── 接线 ──
[ -x "$SIM" ] && ok "simulate-ci.sh 存在且可执行" || no "脚本缺失/不可执行"
grep -q "SYNO_CI=1" "$SIM" && grep -q "SYNO_DIFF_BASE=origin/main" "$SIM" && grep -q "GITHUB_ACTIONS=true" "$SIM" \
  && ok "接线: CI 等价环境三件套（SYNO_CI/SYNO_DIFF_BASE/GITHUB_ACTIONS）" || no "CI 环境变量缺失"
grep -q "grep -oE 'tests/control-tower" "$SIM" \
  && ok "接线: 测试清单从 ci.yml 单源提取（不散列防漂移）" || no "清单硬编码（漂移风险）"

# ── 正常: 全绿桩 → exit 0 ──
# D563/D564 验收（2026-08-31）: 原实现把内层输出丢 /dev/null —— Windows simulate-ci 红时
#   内层失败测试名不可诊断（诊断黑洞）。改为捕获输出，失败时把内层 ❌ 行拼进断言信息，
#   CI ::error annotation 直接给出失败测试名。
GREEN_STUB="$TMPD/green.sh"; printf '#!/bin/bash\nexit 0\n' > "$GREEN_STUB"
OUT=$(SYNO_SIM_PRECOMMIT="$GREEN_STUB" bash "$SIM" 2>&1); rc=$?
if [ "$rc" -eq 0 ]; then
  ok "全绿桩 → exit 0"
else
  INNER=$(echo "$OUT" | grep -E "❌|FAIL" | tr '\n' '|' | tr -d '%' | cut -c1-400)
  no "应 exit 0, 实际 $rc :: 内层失败: ${INNER:-（无 ❌ 行，见上方输出）}"
fi

# ── 失败: 红桩 → exit 1 + 报告（环境差异类错误本地可抓）──
RED_STUB="$TMPD/red.sh"; printf '#!/bin/bash\necho "❌ 模拟 CI 差异错误 (GNU sed 类)"\nexit 1\n' > "$RED_STUB"
OUT=$(SYNO_SIM_PRECOMMIT="$RED_STUB" bash "$SIM" 2>&1); rc=$?
[ "$rc" -eq 1 ] && ok "红桩 → exit 1（本地抓 CI 差异类错误）" || no "应 exit 1, 实际 $rc"
echo "$OUT" | grep -q "模拟失败" && ok "失败报告含修复指引" || no "缺失败报告"

# ── 降级: pre-commit 缺失 → exit 2 ──
OUT2=$(SYNO_SIM_PRECOMMIT="$TMPD/missing.sh" bash "$SIM" 2>&1); rc=$?
[ "$rc" -eq 2 ] && echo "$OUT2" | grep -q "degraded" && ok "pre-commit 缺失 → exit 2 显式降级" || no "应 exit 2+degraded, 实际 $rc"

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
