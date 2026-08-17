#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# synova-commit.test.sh — D414/U1a bypass.log 证据链随提交入库测试
#
# 覆盖矩阵:
#   接线 — U1a git add $BYPASS_LOG 真实存在；--files 模式 FILES+= 覆盖；位置在 git commit 之前
#   注: synova-commit 是完整提交流程（pre-commit+commit+push），不可单测整体；
#       本测试锁定 U1a 的接线正确性（存在 + 位置），行为验证由 M4 复现 + K3 审计兜底.
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SC="$REPO/scripts/control-tower/synova-commit"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "=== D414/U1a synova-commit bypass.log 证据链入库测试 ==="

# ── 接线 1: U1a git add bypass.log 代码存在 ──
if grep -q 'git add "$BYPASS_LOG"' "$SC"; then
  ok "接线: git add \$BYPASS_LOG 存在"
else
  no "U1a git add \$BYPASS_LOG 缺失"
fi

# ── 接线 2: --files 模式 FILES+= bypass.log（覆盖显式路径提交分支）──
if grep -q 'FILES+=(".claude/bypass.log")' "$SC"; then
  ok "接线: --files 模式 FILES+= bypass.log"
else
  no "接线: --files 模式 FILES+= 缺失"
fi

# ── 接线 3: U1a 在 git commit 之前（位置正确——commit 前 add 才有效）──
ADD_LINE=$(grep -n 'git add "$BYPASS_LOG"' "$SC" | head -1 | cut -d: -f1)
# 成功路径的 git commit 在 U1a add 之后（DEGRADED 路径 :480 的 commit 是另一分支, 不计）
COMMIT_LINE=$(awk -v add="$ADD_LINE" 'NR>add && /git commit -m/{print NR; exit}' "$SC")
if [ -n "$ADD_LINE" ] && [ -n "$COMMIT_LINE" ]; then
  ok "位置: U1a add(行$ADD_LINE) 在成功路径 git commit(行$COMMIT_LINE) 之前"
else
  no "位置: U1a add($ADD_LINE) 之后应有成功路径 git commit"
fi

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
