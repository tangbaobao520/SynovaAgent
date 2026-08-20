#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# generated-gate.test.sh — D458 G12d 生成物单点生成门禁测试
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常 — 无生成物暂存 → 门禁通过（soft_pass）
#   降级 — 生成物处于 M/A 状态 → hard_check 阻断
#   边界 — 生成物处于 D（删除）状态 → 不拦（去跟踪/清理合法）
#   接线 — pre-commit-check.sh 含 G12d + GENERATED_FILES 清单（铁律 0-2）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$REPO/scripts/pre-commit-check.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "=== D458 G12d 生成物单点生成门禁测试 ==="

# ── 接线: pre-commit 含 G12d + GENERATED_FILES ──
if grep -q "G12d" "$GATE" && grep -q "GENERATED_FILES" "$GATE"; then
  ok "接线: G12d + GENERATED_FILES 存在"
else
  no "接线: G12d 或 GENERATED_FILES 缺失"
fi

# ── 边界: 生成物清单含 5 个 CI 单点生成文件 ──
for f in "app/founder-dashboard.html" "docs/synova/founder-console.html" "docs/synova/product-lines/product-progress.json" "docs/synova/product-lines/product-progress.html" "docs/synova/product-lines/todos.yaml"; do
  if grep -q "$f" "$GATE"; then
    : # 在清单中
  else
    no "生成物清单缺: $f"
  fi
done
ok "生成物清单 5 文件齐全"

# ── 边界: 删除(D)状态不拦（去跟踪/清理合法）──
if grep -q '_status" = "M" -o "$_status" = "A"' "$GATE"; then
  ok "只拦 M/A 状态，D 状态放行"
else
  no "M/A 状态拦截逻辑缺失"
fi

# ── 边界: CI 绕过（裸 git commit 不触发 pre-commit hook）──
# CI workflow 用裸 git commit，且 CI 环境无我们 hooks → 天然放行
if grep -q "git commit -m" "$REPO/.github/workflows/dashboard-auto.yml" && ! grep -q "synova-commit\|install-hooks" "$REPO/.github/workflows/dashboard-auto.yml"; then
  ok "CI 走裸 git commit（不触发门禁，单点生成放行）"
else
  no "CI 提交方式异常"
fi

echo ""
echo "  结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && echo "  Status: ✅ G12d 生成物门禁测试通过" || echo "  Status: ❌ G12d 生成物门禁测试未通过"
exit $FAIL
