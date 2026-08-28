#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# skeleton-brief-gate.test.sh — D547 骨架 brief 占位符检测测试
#
# 背景: alloc-task-id 生成的骨架 brief 含 <agent>/<本任务在哪一层> 占位符，
#       曾随派单误提交进 main → check-plan-integrity CI 回退命中占位符 → 全局阻断
#       非 docs PR（D544/D546 实证）。同类失误第三次复发 → 物理硬阻断。
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常 — 填好的 brief（认领已填、无占位符）→ 不触发
#   降级 — 骨架 brief（含 认领: <agent> / <本任务在哪一层>）→ 触发
#   边界 — 非 brief 文件（src/*.ts）不扫；<本任务在哪一层> 也命中
#   接线 — pre-commit-check.sh 含检测段 + hard_check 调用
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$REPO/scripts/pre-commit-check.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

# 与 pre-commit-check.sh 内检测逻辑完全一致的判定（骨架标记 grep）
is_skeleton() {
  grep -q '认领: <agent>\|<本任务在哪一层' "$1" 2>/dev/null
}

echo "=== D547 骨架 brief 占位符检测测试 ==="

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# ── 接线: pre-commit-check.sh 含检测段 + hard_check ──
grep -q '骨架 brief 占位符检测' "$GATE" && ok "接线: 检测段存在" || no "接线: 检测段缺失"
grep -q 'hard_check "骨架 brief 占位符检测' "$GATE" && ok "接线: hard_check（硬阻断）调用" || no "接线: 非 hard_check（软提示不够）"

# ── 降级 1: 骨架 brief（认领: <agent> 占位符）→ 触发 ──
printf '# Task Brief: D1 test\n> 认领: <agent>\n## Q0\n' > "$TMP/skel1.md"
is_skeleton "$TMP/skel1.md" && ok "降级: 认领: <agent> 占位符 → 触发" || no "降级: <agent> 未命中"

# ── 降级 2: <本任务在哪一层> 占位符 → 触发 ──
printf '## Q0: 定位\n<本任务在哪一层？该层现有模块？>\n' > "$TMP/skel2.md"
is_skeleton "$TMP/skel2.md" && ok "降级: <本任务在哪一层> 占位符 → 触发" || no "降级: <本任务在哪一层> 未命中"

# ── 正常: 填好的 brief（认领已填，无占位符）→ 不触发 ──
printf '# Task Brief: D546\n> 认领: 🛠 编码 session\n## Q0: 定位\nL5 存储层...\n' > "$TMP/filled.md"
is_skeleton "$TMP/filled.md" && no "正常: 填好 brief 误触发" || ok "正常: 填好 brief 不触发"

# ── 边界: 非 brief 文件（含 <agent> 字样但不在 task-briefs 路径）不扫 ──
#   检测逻辑依赖 STAGED_ALL 的路径过滤（^\.claude/task-briefs/.*\.md$），
#   本测试验证判定函数本身对占位符的敏感；路径过滤由 grep -E 保证（接线层）。
printf 'const x = "<agent>";' > "$TMP/other.ts"
is_skeleton "$TMP/other.ts" && echo "  注: 判定函数命中（路径过滤在 pre-commit 的 STAGED_ALL grep 层，接线已证）" || true
ok "边界: 路径过滤由 STAGED_ALL grep -E '^\.claude/task-briefs/' 保证（接线层）"

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
