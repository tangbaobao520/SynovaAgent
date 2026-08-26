#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# post-commit.test.sh — D521/不变量2: bypass.log COMMITTED hook 层登记
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常 — 裸 git commit（marker 新鲜=pre-commit 跑过）→ 影子登记提交：
#          bypass.log 含本提交 HASH + 工作区无脏变更 + 影子 message 标记
#   防递归 — 再做一个 commit → 影子不再嵌套影子（链长稳定）
#   边界 — marker 缺失（--no-verify 等价场景）→ 不登记（不洗白绕过）
#   接线 — post-commit.sh 含登记段；synova-commit D508 追加已去重
# 沙箱: mktemp git 仓库 + 指向真实 hook 的委托（M13: git -c 一次性身份参数）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
# M13/D521: hook 上下文会导出 GIT_DIR/GIT_WORK_TREE——沙箱 git 命令必须剥掉
# （git -C 不覆盖 GIT_DIR env；D521-3 实证沙箱提交落到宿主分支）
unset GIT_DIR GIT_WORK_TREE
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOK_SRC="$REPO/scripts/hooks/post-commit.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT

echo "=== D521 不变量2: bypass hook 层登记 ==="

# ── 接线 ──
grep -q "bypass COMMITTED 登记" "$HOOK_SRC" && ok "接线: post-commit.sh 含 hook 层登记段" || no "登记段缺失"
if grep -q 'echo "$(date -Iseconds) | COMMITTED | pre-commit PASS | TASK_ID=\$TASK_ID' "$REPO/scripts/control-tower/synova-commit"; then
  no "synova-commit D508 追加未去重（会与 hook 双写留脏）"
else
  ok "接线: synova-commit D508 追加已去重"
fi

# ── 沙箱: git init + 委托 hook 指向真实脚本 ──
SB="$TMPD/sb"; mkdir -p "$SB/.claude" "$SB/.git/hooks"
git -C "$SB" init -q
printf '#!/bin/bash\nexec bash "%s"\n' "$HOOK_SRC" > "$SB/.git/hooks/post-commit"
chmod +x "$SB/.git/hooks/post-commit"
echo "seed" > "$SB/.claude/bypass.log"
git -C "$SB" add .claude/bypass.log
git -C "$SB" -c user.name=t -c user.email=t@t commit -q --no-verify -m "seed"

# 场景A: marker 新鲜（模拟 pre-commit 跑过）→ 裸 git commit → 应自动登记
echo "feature-a" > "$SB/a.txt"
git -C "$SB" add a.txt
echo "$(git -C "$SB" rev-parse HEAD)|$(date +%s)" > "$SB/.claude/last-precommit-success"
git -C "$SB" -c user.name=t -c user.email=t@t commit -q --no-verify -m "feat: real commit A"
REAL_HASH=$(git -C "$SB" rev-parse HEAD^)   # 影子已是 HEAD，真实提交 = HEAD^
grep -q "$REAL_HASH" "$SB/.claude/bypass.log" && ok "裸 git commit 后 bypass.log 含本提交 HASH" || no "HASH 未登记"
DIRTY=$(git -C "$SB" status --porcelain -- .claude/bypass.log)
[ -z "$DIRTY" ] && ok "bypass.log 无未提交脏变更（竞态根治）" || no "仍脏: $DIRTY"
git -C "$SB" log -1 --format=%s | grep -q "bypass COMMITTED 登记" && ok "影子登记提交 message 标记存在" || no "影子提交缺失"

# 场景B: 再做一个 commit → 不嵌套（影子不登记影子）
BEFORE=$(git -C "$SB" rev-list --count HEAD)
echo "feature-b" > "$SB/b.txt"
git -C "$SB" add b.txt
echo "$(git -C "$SB" rev-parse HEAD)|$(date +%s)" > "$SB/.claude/last-precommit-success"
git -C "$SB" -c user.name=t -c user.email=t@t commit -q --no-verify -m "feat: real commit B"
AFTER=$(git -C "$SB" rev-list --count HEAD)
DELTA=$((AFTER - BEFORE))
[ "$DELTA" -eq 2 ] && ok "第二个 commit 同样 1 真 + 1 影子（链长稳定，无递归嵌套）" || no "提交数异常: +$DELTA（期望 +2）"

# 场景C: marker 缺失（--no-verify 等价）→ 不登记
rm -f "$SB/.claude/last-precommit-success"
echo "feature-c" > "$SB/c.txt"
git -C "$SB" add c.txt
git -C "$SB" -c user.name=t -c user.email=t@t commit -q --no-verify -m "feat: bypassed commit C"
C_HASH=$(git -C "$SB" rev-parse HEAD)
if grep -q "$C_HASH" "$SB/.claude/bypass.log"; then
  no "marker 缺失仍登记（洗白绕过）"
else
  ok "marker 缺失（绕过）→ 不登记（证据诚实）"
fi

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
