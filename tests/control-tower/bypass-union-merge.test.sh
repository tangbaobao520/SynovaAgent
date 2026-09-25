#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# bypass-union-merge.test.sh — D970（D735 Stage 2）账本出库的**冲突根因**回归
#
# 本文件原为 D457/CT-47「union 合并」守卫（断言 .gitattributes 声明 merge=union）。
# Stage 2 后该属性按设计**移除**——因为根因不是「没 union」，而是「运行期产物被 git 跟踪」：
#   GitHub 服务端不认 merge=union ⇒ 两条分支各自追加同一被跟踪文件 ⇒ 真冲突（5 条 dirty PR 全部只此一因）。
#
# 覆盖矩阵（铁律 48 三路径 + 根因 + 接线）:
#   根因复现 — 沙箱: 被跟踪的 .claude/bypass.log + 无 union ⇒ 两分支合并**必冲突**
#   正常     — 沙箱: 账本出库（ignored/untracked）+ per-session ⇒ 两分支合并**零冲突**
#   边界     — 本仓: `.gitattributes` 不再声明 bypass.log union；`reference-map.md` 那条**仍在**
#   边界     — 本仓: `.claude/bypass.log` 被忽略 + 未跟踪（出库两要件）
#   接线     — install-hooks.sh 仍注册 merge.union.driver（reference-map 仍用 union）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
SANDBOX="$(mktemp -d)"; trap 'rm -rf "$SANDBOX"' EXIT

echo "=== D970 Stage 2: bypass 账本出库的冲突根因回归 ==="

# ── 边界: .gitattributes 不再声明 bypass.log union（reference-map 那条不动）──
if grep -q '^\.claude/bypass\.log merge=union' "$REPO/.gitattributes" 2>/dev/null; then
  no ".gitattributes 仍声明 bypass.log merge=union（Stage 2 应移除）"
else
  ok ".gitattributes 未声明 bypass.log merge=union（Stage 2 已移除该行）"
fi
grep -q '^\.claude/reference-map\.md merge=union' "$REPO/.gitattributes" 2>/dev/null \
  && ok ".gitattributes 仍保留 reference-map.md merge=union（本卡未动）" \
  || no "reference-map.md 的 union 声明被误删"

# ── 边界: 出库两要件（忽略 + 未跟踪）──
if git -C "$REPO" check-ignore -q .claude/bypass.log; then
  ok ".claude/bypass.log 被 .gitignore 忽略"
else
  no ".claude/bypass.log 未被忽略（出库要件缺失）"
fi
TRACKED=$(git -C "$REPO" ls-files .claude/bypass.log | tr -d '\n')
if [ -z "$TRACKED" ]; then
  ok ".claude/bypass.log 未被 git 跟踪（git rm --cached 生效）"
else
  no ".claude/bypass.log 仍被跟踪: $TRACKED"
fi

# ── 接线: install-hooks.sh 仍注册 union driver（reference-map 需要）──
if grep -q "merge.union.driver" "$REPO/scripts/install-hooks.sh" 2>/dev/null; then
  ok "接线: install-hooks.sh 仍注册 merge.union.driver（供 reference-map 用）"
else
  no "接线: install-hooks.sh 未注册 merge.union.driver"
fi

# ── 根因复现: 被跟踪 + 无 union ⇒ 合并必冲突 ──
S1="$SANDBOX/tracked"; mkdir -p "$S1"
git -C "$S1" init -q; git -C "$S1" config user.name t; git -C "$S1" config user.email t@t
mkdir -p "$S1/.claude"
printf 'line-A\n' > "$S1/.claude/bypass.log"
git -C "$S1" add -A; git -C "$S1" commit -qm base
BASE_BRANCH="$(git -C "$S1" branch --show-current)"
git -C "$S1" checkout -qb b1; printf 'line-B\n' >> "$S1/.claude/bypass.log"; git -C "$S1" commit -qam b1
git -C "$S1" checkout -q "$BASE_BRANCH"; git -C "$S1" checkout -qb b2
printf 'line-C\n' >> "$S1/.claude/bypass.log"; git -C "$S1" commit -qam b2
M1_OUT="$(git -C "$S1" merge b1 --no-edit 2>&1)"; M1_RC=$?
if [ "$M1_RC" -ne 0 ] && printf '%s' "$M1_OUT" | grep -q 'CONFLICT'; then
  ok "根因复现: 被跟踪账本 + 无 union → 合并冲突（rc=${M1_RC}）"
else
  no "根因未复现（rc=${M1_RC}）: $(printf '%s' "$M1_OUT" | tr '\n' ' ')"
fi

# ── 正常: 出库后（ignored/untracked）+ per-session ⇒ 两分支合并零冲突 ──
S2="$SANDBOX/outofgit"; mkdir -p "$S2"
git -C "$S2" init -q; git -C "$S2" config user.name t; git -C "$S2" config user.email t@t
mkdir -p "$S2/.claude" "$S2/.sessions"
printf '.claude/bypass.log\n.sessions/\n' > "$S2/.gitignore"
printf 'line-A\n' > "$S2/.claude/bypass.log"          # 本机残留（不跟踪）
git -C "$S2" add -A; git -C "$S2" commit -qm base
BASE_BRANCH="$(git -C "$S2" branch --show-current)"
git -C "$S2" checkout -qb b1
mkdir -p "$S2/.sessions/sess-b"; printf 'line-B\n' >> "$S2/.sessions/sess-b/bypass.log"; printf 'line-B\n' >> "$S2/.claude/bypass.log"
git -C "$S2" add -A; git -C "$S2" commit -qm b1 --allow-empty
git -C "$S2" checkout -q "$BASE_BRANCH"; git -C "$S2" checkout -qb b2
mkdir -p "$S2/.sessions/sess-c"; printf 'line-C\n' >> "$S2/.sessions/sess-c/bypass.log"; printf 'line-C\n' >> "$S2/.claude/bypass.log"
git -C "$S2" add -A; git -C "$S2" commit -qm b2 --allow-empty
M2_OUT="$(git -C "$S2" merge b1 --no-edit 2>&1)"; M2_RC=$?
if [ "$M2_RC" -eq 0 ] && ! printf '%s' "$M2_OUT" | grep -q 'CONFLICT'; then
  ok "出库后: 两分支各写 per-session → 合并零冲突（rc=0）"
else
  no "出库后仍冲突（rc=${M2_RC}）: $(printf '%s' "$M2_OUT" | tr '\n' ' ')"
fi
ST2="$(git -C "$S2" status --porcelain | grep -E 'bypass\.log' || true)"
if [ -z "$ST2" ]; then
  ok "出库后: 账本写入不产生任何 git status 变更"
else
  no "出库后仍出现账本变更: $(printf '%s' "$ST2" | tr '\n' ' ')"
fi

echo ""
echo "  结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && echo "  Status: ✅ bypass 出库冲突根因回归通过" || echo "  Status: ❌ bypass 出库冲突根因回归未通过"
exit $FAIL
