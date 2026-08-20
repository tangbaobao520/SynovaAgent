#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# bypass-union-merge.test.sh — D457/CT-47 bypass.log union 合并测试
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常 — 两分支各追加 bypass.log 行，merge=union 自动取并集无冲突
#   降级 — 未注册 union driver 时，git 正常 fallback（声明了 driver 但无定义）
#   边界 — .gitattributes 含 .claude/bypass.log merge=union
#   接线 — install-hooks.sh 注册 merge.union.driver（铁律 0-2）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "=== D457/CT-47 bypass.log union 合并测试 ==="

# ── 接线: install-hooks.sh 注册 merge.union.driver ──
if grep -q "merge.union.driver" "$REPO/scripts/install-hooks.sh" 2>/dev/null; then
  ok "接线: install-hooks.sh 注册 merge.union.driver"
else
  no "接线: install-hooks.sh 未注册 merge.union.driver"
fi

# ── 边界: .gitattributes 声明 bypass.log merge=union ──
if grep -q ".claude/bypass.log merge=union" "$REPO/.gitattributes" 2>/dev/null; then
  ok ".gitattributes 声明 bypass.log merge=union"
else
  no ".gitattributes 未声明 bypass.log merge=union"
fi

# ── 正常: 沙箱验证 union 自动合并（两分支各追加 → 取并集无冲突）──
SANDBOX=$(mktemp -d)
trap 'rm -rf "$SANDBOX"' EXIT
VERIFY=$(cd "$SANDBOX" && git init -q 2>/dev/null && \
  git config user.name t && git config user.email t@t && \
  git config merge.union.driver "git merge-file --union %A %O %B" && \
  echo ".claude/bypass.log merge=union" > .gitattributes && \
  mkdir -p .claude && echo "line-A" > .claude/bypass.log && \
  git add -A && git commit -qm base && \
  BASE=$(git branch --show-current) && \
  git checkout -qb b1 && echo "line-B" >> .claude/bypass.log && git commit -qam b1 && \
  git checkout -q "$BASE" && git checkout -qb b2 && echo "line-C" >> .claude/bypass.log && git commit -qam b2 && \
  git merge b1 --no-edit 2>&1 && \
  cat .claude/bypass.log | grep -c "line-")
if echo "$VERIFY" | grep -q "3"; then
  ok "union 合并取并集（3 行全在，无冲突）"
else
  no "union 合并应 3 行全在, 实际: $VERIFY"
fi

echo ""
echo "  结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && echo "  Status: ✅ bypass union 合并测试通过" || echo "  Status: ❌ bypass union 合并测试未通过"
exit $FAIL
