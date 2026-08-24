#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# q2-error-locating.test.sh — D515 项5: Q2 排除项报错带定位（Codex P6）
#
# 覆盖矩阵:
#   正常 — 违规排除项 → 报错含原文 + brief 行号 + 修复示例，exit 1
#   通过 — 排除项含文件路径 → exit 0 该节通过
#   边界 — 无排除项/无 Q2 → 不报错
#   接线 — check-plan-integrity.sh 含行号提取逻辑（NR "|"）
# 沙箱: mktemp git 仓库 + 复制 scripts（M13: git -c 一次性身份参数）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CPI="$REPO/scripts/check-plan-integrity.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT

echo "=== D515 项5: Q2 排除项报错带定位 ==="

grep -q 'print NR "|" $0' "$CPI" && ok "接线: 行号提取逻辑（NR |）已接入" || no "行号提取缺失"
grep -q '修复示例: - 不改' "$CPI" && ok "接线: 修复示例文案存在" || no "修复示例缺失"

SB="$TMPD/sb"; mkdir -p "$SB/scripts" "$SB/.claude/task-briefs"
cp -R "$REPO/scripts/." "$SB/scripts/"
git -C "$SB" init -q
TODAY=$(date +%Y-%m-%d)
BRIEF="$SB/.claude/task-briefs/${TODAY}-T1.md"
cat > "$BRIEF" <<BRIEFEOF
# T1 测试 brief

## Q2: 范围
做什么:
- 改 src/foo.ts
不做什么:
- 不改 某某全局配置
- 不改 scripts/bar.sh — 原因

## Done 标准:
- verify: echo ok
BRIEFEOF
echo "${TODAY}-T1.md" > "$SB/.claude/current-brief"
cat > "$SB/.claude/plan.json" <<'PLANEOF'
{"principles": ["p1"], "approach": "reuse", "memory_refs": [], "phases": []}
PLANEOF
BADLINE=$(grep -n "不改 某某全局配置" "$BRIEF" | cut -d: -f1)
git -C "$SB" -c user.name=t -c user.email=t@t add .claude/task-briefs >/dev/null 2>&1

OUT=$(cd "$SB" && bash "$SB/scripts/check-plan-integrity.sh" 2>&1); rc=$?
[ "$rc" -eq 1 ] && ok "违规排除项 → exit 1（原行为保留）" || no "应 exit 1, 实际 $rc"
echo "$OUT" | grep -q "brief 第 ${BADLINE} 行" && ok "报错含 brief 内行号（第 ${BADLINE} 行）" || no "缺行号定位: $OUT"
echo "$OUT" | grep -q "不改 某某全局配置" && ok "报错含违规排除项原文" || no "缺原文"
echo "$OUT" | grep -q "修复示例: - 不改" && ok "报错含一行修复示例" || no "缺修复示例"

# 正常路径: 排除项全部含路径 → 该节通过
sed -i '' 's|- 不改 某某全局配置|- 不改 src/global-config.ts — 原因|' "$BRIEF"
OUT2=$(cd "$SB" && bash "$SB/scripts/check-plan-integrity.sh" 2>&1); rc2=$?
[ "$rc2" -eq 0 ] && echo "$OUT2" | grep -q "Q2 排除项均含文件路径" && ok "排除项含路径 → 通过" || no "合法排除项被误报: $rc2 :: $OUT2"

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
