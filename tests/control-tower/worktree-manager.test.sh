#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# worktree-manager.test.sh — D515 项12: status 子命令 merge driver 健康度
# （CT 配对门禁要求的 .test.sh；深覆盖见 worktree-manager.test.py）
#
# 覆盖矩阵:
#   正常 — .gitattributes 注册 union → merge_driver_health 两文件 true
#   降级 — .gitattributes 缺失 → 两文件 false（显式健康度，不静默）
#   接线 — cmd_status 含 merge_driver_health 字段
# 沙箱: mktemp git 仓库（M13: git 身份 -c 一次性参数）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WM="$REPO/scripts/control-tower/worktree-manager.py"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT

echo "=== D515 项12: worktree-manager merge driver 健康度 ==="

grep -q "merge_driver_health" "$WM" && ok "接线: cmd_status 含 merge_driver_health" || no "字段缺失"

SB="$TMPD/sb"; mkdir -p "$SB"; git -C "$SB" init -q
# 正常: .gitattributes 注册 union
printf '.claude/bypass.log merge=union\n.claude/reference-map.md merge=union\n' > "$SB/.gitattributes"
OUT=$(cd "$SB" && python3 "$WM" status d515-test 2>&1)
echo "$OUT" | grep -q '"merge_driver_health"' && ok "status 输出含 merge_driver_health 字段" || no "status 输出缺字段: $OUT"
echo "$OUT" | grep -q '"\.claude/bypass.log": true' && echo "$OUT" | grep -q '"\.claude/reference-map.md": true' \
  && ok "union 已注册 → 两文件 true" || no "已注册应为 true: $OUT"

# 降级: 无 .gitattributes → false（显式）
rm "$SB/.gitattributes"
OUT2=$(cd "$SB" && python3 "$WM" status d515-test 2>&1)
echo "$OUT2" | grep -q '"\.claude/bypass.log": false' && ok "未注册 → false（显式健康度）" || no "未注册应为 false: $OUT2"

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
