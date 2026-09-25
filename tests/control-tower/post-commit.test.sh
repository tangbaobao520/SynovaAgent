#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# post-commit.test.sh — D521/不变量2（**D970 Stage 2 改写**）: bypass 证据 hook 层登记
#
# Stage 2 契约（本文件对齐的对象）:
#   · 证据只落 per-session `.sessions/<sid>/bypass.log`；旧路径 `.claude/bypass.log` **已出库、停写**
#   · **影子登记提交已删除**（其唯一目的是让被跟踪的旧路径「永不脏」，出库后该目的消失）
#     ⇒ 每个真实提交 = 1 个提交（不再 +1 影子）
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常 — 裸 git commit（marker 新鲜）→ per-session 含本提交 HASH；HEAD 即真实提交；旧路径零新增
#   正常 — 连做第二个 commit → 每提交 +1（链长 1:1，无影子嵌套）
#   边界 — marker 缺失（--no-verify 等价）→ 不登记（不洗白绕过）
#   CT-43/D554 — 遗留他人 staged 文件不被 hook 消费（暂存状态保持、不卷入真实提交）
#   降级 — 账本落点不可写 → 显式 ❌ + degraded-events 留痕（**不回退旧路径**，不静默）
#   接线 — 调 bypass-ledger.sh；旧路径直写与影子登记提交均已移除
# 沙箱: mktemp git 仓库 + 委托 hook 指向真实脚本（M13: 剥 GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOK_SRC="$REPO/scripts/hooks/post-commit.sh"
LEDGER_SRC="$REPO/scripts/control-tower/bypass-ledger.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT
SID="postcommit-test"
export SYNO_SESSION_ID="$SID"

echo "=== D521 不变量2（Stage 2）: bypass hook 层登记 → per-session 单一落点 ==="

# ── 接线 ──
grep -q "bypass-ledger.sh" "$HOOK_SRC" && ok "接线: post-commit.sh 调 bypass-ledger.sh（per-session 落点）" || no "未接账本脚本"
if grep -q '>> "$ROOT/.claude/bypass.log"' "$HOOK_SRC"; then
  no "旧路径仍在直写（Stage 2 应停写）"
else
  ok "接线: 旧路径已停写（Stage 2 单一落点）"
fi
if grep -q 'git commit --no-verify -q -o -m "chore: bypass COMMITTED' "$HOOK_SRC"; then
  no "影子登记提交仍在（Stage 2 应删除）"
else
  ok "接线: 影子登记提交已删除"
fi

# ── 沙箱 ──
SB="$TMPD/sb"; mkdir -p "$SB/.claude" "$SB/.git/hooks" "$SB/scripts/control-tower"
git -C "$SB" init -q
git -C "$SB" config user.name t
git -C "$SB" config user.email t@t
cp "$LEDGER_SRC" "$SB/scripts/control-tower/bypass-ledger.sh"
printf '#!/bin/bash\nexec bash "%s"\n' "$HOOK_SRC" > "$SB/.git/hooks/post-commit"
chmod +x "$SB/.git/hooks/post-commit"
echo "seed" > "$SB/.claude/bypass.log"     # 旧路径残留（出库后本机仍可能存在，但不应再被写）
git -C "$SB" add .claude/bypass.log
git -C "$SB" -c user.name=t -c user.email=t@t commit -q --no-verify -m "seed"
SESS="$SB/.sessions/$SID/bypass.log"
LEGACY_BEFORE=$(wc -l < "$SB/.claude/bypass.log" | tr -d ' ')

# 场景A: marker 新鲜（模拟 pre-commit 跑过）→ 裸 git commit → 应自动登记（per-session）
echo "feature-a" > "$SB/a.txt"
git -C "$SB" add a.txt
echo "$(git -C "$SB" rev-parse HEAD)|$(date +%s)" > "$SB/.claude/last-precommit-success"
git -C "$SB" -c user.name=t -c user.email=t@t commit -q --no-verify -m "feat: real commit A"
REAL_HASH=$(git -C "$SB" rev-parse HEAD)     # Stage 2: 无影子 ⇒ HEAD 即真实提交
if [ -f "$SESS" ] && grep -q "$REAL_HASH" "$SESS"; then ok "per-session 含本提交 HASH"; else no "per-session 未登记 HASH"; fi
grep -q "COMMITTED | pre-commit PASS (hook 层登记) | HASH=$REAL_HASH" "$SESS" 2>/dev/null \
  && ok "登记行格式保持（COMMITTED + hook 层标记）" || no "登记行格式变化"
LEGACY_AFTER=$(wc -l < "$SB/.claude/bypass.log" | tr -d ' ')
[ "$LEGACY_AFTER" = "$LEGACY_BEFORE" ] && ok "旧路径零新增（${LEGACY_BEFORE} → ${LEGACY_AFTER} 行）" || no "旧路径被写（${LEGACY_BEFORE} → ${LEGACY_AFTER}）"
DIRTY=$(git -C "$SB" status --porcelain -- .claude/bypass.log)
[ -z "$DIRTY" ] && ok "旧路径无未提交变更（出库后不可能再脏）" || no "仍脏: $DIRTY"

# 场景B: 再做一个 commit → 每提交 +1（无影子嵌套）
BEFORE=$(git -C "$SB" rev-list --count HEAD)
echo "feature-b" > "$SB/b.txt"
git -C "$SB" add b.txt
echo "$(git -C "$SB" rev-parse HEAD)|$(date +%s)" > "$SB/.claude/last-precommit-success"
git -C "$SB" -c user.name=t -c user.email=t@t commit -q --no-verify -m "feat: real commit B"
AFTER=$(git -C "$SB" rev-list --count HEAD)
DELTA=$((AFTER - BEFORE))
[ "$DELTA" -eq 1 ] && ok "第二个 commit 链长 +1（影子已删，无嵌套）" || no "提交数异常: +${DELTA}（期望 +1）"

# 场景C: marker 缺失（--no-verify 等价）→ 不登记
rm -f "$SB/.claude/last-precommit-success"
echo "feature-c" > "$SB/c.txt"
git -C "$SB" add c.txt
git -C "$SB" -c user.name=t -c user.email=t@t commit -q --no-verify -m "feat: bypassed commit C"
C_HASH=$(git -C "$SB" rev-parse HEAD)
if grep -q "$C_HASH" "$SESS" 2>/dev/null; then
  no "marker 缺失仍登记（洗白绕过）"
else
  ok "marker 缺失（绕过）→ 不登记（证据诚实）"
fi

# 场景D（CT-43/D554）: 遗留他人 staged 文件不被 hook 消费
echo "foreign" > "$SB/foreign.txt"
git -C "$SB" add foreign.txt
echo "feature-d" > "$SB/d.txt"
git -C "$SB" add d.txt
echo "$(git -C "$SB" rev-parse HEAD)|$(date +%s)" > "$SB/.claude/last-precommit-success"
git -C "$SB" -c user.name=t -c user.email=t@t commit -q --no-verify -m "feat: real commit D" -- d.txt
if git -C "$SB" status --porcelain | grep -q '^A  foreign.txt'; then
  ok "foreign.txt 仍留在暂存区（hook 不消费他人 staged）"
else
  no "foreign.txt 暂存状态被破坏（$(git -C "$SB" status --porcelain | tr '\n' ' ')）"
fi
if git -C "$SB" cat-file -e "HEAD:foreign.txt" 2>/dev/null; then # swallow-ok: 文件不存在=断言目标状态（未卷入），非错误吞
  no "foreign.txt 被卷进真实提交（pathspec 失效）"
else
  ok "真实提交未包含 foreign.txt（pathspec 提交语义保持）"
fi
D_HASH=$(git -C "$SB" rev-parse HEAD)
grep -q "$D_HASH" "$SESS" 2>/dev/null && ok "场景D 证据同样落 per-session" || no "场景D 未登记"

# 降级（Stage 2 硬要求: 失败不许静默回退旧路径）
SB2="$TMPD/sb2"; mkdir -p "$SB2/.claude" "$SB2/.git/hooks" "$SB2/scripts/control-tower"
git -C "$SB2" init -q; git -C "$SB2" config user.name t; git -C "$SB2" config user.email t@t
cp "$LEDGER_SRC" "$SB2/scripts/control-tower/bypass-ledger.sh"
printf '#!/bin/bash\nexec bash "%s"\n' "$HOOK_SRC" > "$SB2/.git/hooks/post-commit"
chmod +x "$SB2/.git/hooks/post-commit"
echo "seed" > "$SB2/.claude/bypass.log"; git -C "$SB2" add -A
git -C "$SB2" -c user.name=t -c user.email=t@t commit -q --no-verify -m "seed"
RO="$TMPD/readonly"; mkdir -p "$RO"; chmod 500 "$RO"
echo "feature-e" > "$SB2/e.txt"; git -C "$SB2" add e.txt
echo "$(git -C "$SB2" rev-parse HEAD)|$(date +%s)" > "$SB2/.claude/last-precommit-success"
E_OUT=$(SYNO_BYPASS_LEDGER_DIR="$RO/sub" git -C "$SB2" -c user.name=t -c user.email=t@t commit --no-verify -m "feat: ledger unwritable" 2>&1 || true)
chmod 700 "$RO" 2>/dev/null || true
echo "$E_OUT" | grep -q "bypass 账本写入失败" && ok "降级: 落点不可写 → 显式 ❌ 提示" || no "降级无显式提示（静默）"
echo "$E_OUT" | grep -q "无旧路径可回退" && ok "降级: 明示不回退旧路径（Stage 2 语义）" || no "未明示不回退"
LEGACY_E=$(wc -l < "$SB2/.claude/bypass.log" | tr -d ' ')
[ "$LEGACY_E" = "1" ] && ok "降级: 旧路径未被偷偷写入（仍 1 行）" || no "降级回退写了旧路径（${LEGACY_E} 行）"

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
