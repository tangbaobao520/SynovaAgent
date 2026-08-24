#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# synova-submit.test.sh — D521/目标1: 统一提交入口编排顺序
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常 — --dry-run 全绿桩 → 五步输出顺序正确（①tag 在 ③dry-run 在 ④模拟 前）+ exit 0
#   失败 — ④模拟桩红 → exit 1 + ⑤ commit 不执行
#   失败 — ③dry-run 桩红 → exit 1 + ④不执行
#   边界 — 缺必需参数 → exit 2 + 用法
#   接线 — synova-commit 含 SYNO_SUBMIT_MODE（不 auto-tag/push）；提交顺序物理断言
# 沙箱: SYNO_SUBMIT_CHECK_CMD/SYNO_SUBMIT_SIM_CMD 注入桩（零真实门禁/提交）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
unset GIT_DIR GIT_WORK_TREE
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SUB="$REPO/scripts/control-tower/synova-submit.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT

echo "=== D521 目标1: synova submit 编排 ==="

# ── 接线 ──
[ -x "$SUB" ] && ok "synova-submit.sh 存在且可执行" || no "脚本缺失"
grep -q "SYNO_SUBMIT_MODE=1" "$REPO/scripts/control-tower/synova-commit" \
  && ok "接线: synova-commit 含 submit 模式（不 auto-tag/push，§6）" || no "synova-commit 未接 submit 模式"
# 顺序物理断言: 脚本内 ①→②→③→④→⑤→⑥ 段出现顺序
SEQ=$(grep -oE "── [①②③④⑤⑥]" "$SUB" | awk '!seen[$0]++ {printf "%s", $2}')
[ "$SEQ" = "①②③④⑤⑥" ] && ok "接线: 六段物理顺序 ①→⑥ 正确" || no "段顺序异常: $SEQ"

# ── 沙箱仓库（origin/main ref 供 ①）──
SB="$TMPD/sb"; mkdir -p "$SB/.claude"
git -C "$SB" init -q
git -C "$SB" -c user.name=t -c user.email=t@t commit -q --allow-empty -m base
git -C "$SB" update-ref refs/remotes/origin/main HEAD

GREEN_CHECK="$TMPD/check.sh"; printf '#!/bin/bash\necho "stub check $*"\nexit 0\n' > "$GREEN_CHECK"
RED_CHECK="$TMPD/redcheck.sh"; printf '#!/bin/bash\necho "stub check FAIL"\nexit 1\n' > "$RED_CHECK"
GREEN_SIM="$TMPD/sim.sh"; printf '#!/bin/bash\necho "stub sim ok"\nexit 0\n' > "$GREEN_SIM"
RED_SIM="$TMPD/redsim.sh"; printf '#!/bin/bash\necho "stub sim FAIL"\nexit 1\n' > "$RED_SIM"

# ── 正常: 全绿桩 --dry-run → exit 0 + 五步顺序 ──
OUT=$(cd "$SB" && SYNO_SUBMIT_CHECK_CMD="$GREEN_CHECK" SYNO_SUBMIT_SIM_CMD="$GREEN_SIM" \
  bash "$SUB" --task-id D521 --agent t --message "test: x" --dry-run 2>&1); rc=$?
[ "$rc" -eq 0 ] && ok "全绿桩 --dry-run → exit 0" || no "应 exit 0, 实际 $rc :: $(echo "$OUT" | tail -2)"
ORDER=$(echo "$OUT" | grep -oE "── [①②③④]" | grep -oE "[①②③④]" | tr -d '\n')
[ "$ORDER" = "①②③④" ] && ok "输出顺序 ①tag→②bypass→③dry-run→④模拟" || no "输出顺序异常: $ORDER"
echo "$OUT" | grep -q "无孤儿 tag" && ok "① 输出孤儿 tag 状态" || no "① 输出缺失"

# ── 失败: ④模拟红 → exit 1 + ⑤不执行 ──
OUT2=$(cd "$SB" && SYNO_SUBMIT_CHECK_CMD="$GREEN_CHECK" SYNO_SUBMIT_SIM_CMD="$RED_SIM" \
  bash "$SUB" --task-id D521 --agent t --message "test: x" 2>&1); rc=$?
[ "$rc" -eq 1 ] && ok "④模拟红 → exit 1" || no "应 exit 1, 实际 $rc"
echo "$OUT2" | grep -q "── ⑤" && no "④失败后仍执行 ⑤" || ok "④失败 → ⑤ commit 不执行"

# ── 失败: ③dry-run 红 → exit 1 + ④不执行 ──
OUT3=$(cd "$SB" && SYNO_SUBMIT_CHECK_CMD="$RED_CHECK" SYNO_SUBMIT_SIM_CMD="$GREEN_SIM" \
  bash "$SUB" --task-id D521 --agent t --message "test: x" 2>&1); rc=$?
[ "$rc" -eq 1 ] && echo "$OUT3" | grep -q "④ CI 等价模拟" && no "③失败后仍执行 ④" || ok "③失败 → ④模拟不执行 (exit $rc)"

# ── 边界: 缺参数 → exit 2 ──
bash "$SUB" --task-id D521 >/dev/null 2>&1; rc=$?
[ "$rc" -eq 2 ] && ok "缺必需参数 → exit 2（D328 三态）" || no "应 exit 2, 实际 $rc"

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
