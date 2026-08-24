#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# verify-parallel.test.sh — D513 PYBIN 探测 + V5.0.1 已完成任务文档豁免（U7/CT-40）
#
# 背景 (V5.0.1, Win 反馈 2026-08-24): D481 已合并，D483 修订其写集
# （auth.integration.test.ts）被 --scan-today 误判并行重叠。修法: compare_docs 前置
# 检查——任一文档写集全部已在 origin/main → 视为已完成任务，跳过（串行演进非并行冲突）。
# origin/main 不可解析 → 不豁免（fail-closed）。
#
# 覆盖（铁律 48; 函数/端到端混合）:
#   T1  接线: 豁免逻辑（"已完成任务文档"）已接入
#   T2  接线: 豁免基于 origin/main 判定
#   T3  场景A: 已完成 doc（写集在 main）vs 活跃 doc → 跳过（不误判重叠）
#   T4  场景B: 两个活跃 doc 写集重叠 → 仍 block（保护不削弱）
#   T5  PYBIN: 三级探测接线保持（D513 回归）
#
# 用法: bash tests/control-tower/verify-parallel.test.sh
# 退出码: 0 = 全部通过
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
VP="$REPO/scripts/control-tower/verify-parallel.sh"
[ -f "$VP" ] || VP="$REPO/scripts/workflow/verify-parallel.sh"

PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "=== verify-parallel: V5.0.1 已完成文档豁免 + D513 PYBIN ==="

# ── 接线 ──
grep -q "已完成任务文档" "$VP" && ok "T1 接线: 豁免逻辑已接入" || no "T1 豁免逻辑缺失"
grep -q "origin/main" "$VP" && ok "T2 接线: 豁免基于 origin/main" || no "T2 origin/main 判定缺失"
grep -q "PYBIN" "$VP" && ok "T5 接线: PYBIN 三级探测保持（D513）" || no "T5 PYBIN 缺失"

# ── 沙箱: 已完成 doc（写集在 main）vs 活跃 doc（写集新文件）──
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT
SB="$TMPD/sb"; mkdir -p "$SB"
cp -R "$REPO/scripts" "$SB/scripts"
mkdir -p "$SB/src/middleware" "$SB/docs/plans/codex/implementation"
git -C "$SB" init -q
echo "export const merged = 1;" > "$SB/src/middleware/merged.ts"
git -C "$SB" add -A >/dev/null 2>&1
git -C "$SB" -c user.email=t@t -c user.name=t commit -qm init
git -C "$SB" update-ref refs/remotes/origin/main HEAD

cat > "$SB/docs/plans/codex/implementation/SYNOVA-IMPL-D999-done-20260824.md" <<'EOF'
### 3.1 写集 (1 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|------|------|
| src/middleware/merged.ts | 修改 | 已交付文件 |
EOF
cat > "$SB/docs/plans/codex/implementation/SYNOVA-IMPL-D998-active-20260824.md" <<'EOF'
### 3.1 写集 (1 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|------|------|
| src/middleware/new.ts | 修改 | 活跃文件 |
EOF

# 场景A: 已完成 vs 活跃 → 跳过（不误判重叠）
OUT=$(cd "$SB" && bash "$SB/scripts/control-tower/verify-parallel.sh" --doc-a "docs/plans/codex/implementation/SYNOVA-IMPL-D999-done-20260824.md" --doc-b "docs/plans/codex/implementation/SYNOVA-IMPL-D998-active-20260824.md" 2>&1); rc=$?
if echo "$OUT" | grep -q "跳过已完成任务文档"; then
  ok "T3 已完成 vs 活跃: 跳过 (rc=$rc)"
else
  no "T3 应跳过已完成 doc, rc=$rc :: $OUT"
fi

# 场景B: 两个活跃 doc 写集重叠 → 仍 block
cat > "$SB/docs/plans/codex/implementation/SYNOVA-IMPL-D997-active2-20260824.md" <<'EOF'
### 3.1 写集 (1 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|------|------|
| src/middleware/new.ts | 修改 | 与 D998 重叠 |
EOF
OUT2=$(cd "$SB" && bash "$SB/scripts/control-tower/verify-parallel.sh" --doc-a "docs/plans/codex/implementation/SYNOVA-IMPL-D998-active-20260824.md" --doc-b "docs/plans/codex/implementation/SYNOVA-IMPL-D997-active2-20260824.md" 2>&1); rc2=$?
if echo "$OUT2" | grep -q "写集重叠"; then
  ok "T4 活跃 vs 活跃重叠: 仍 block (rc=$rc2)"
else
  no "T4 应 block, rc=$rc2 :: $OUT2"
fi

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
