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
#   CT-43/D554 — 暂存区遗留他人文件 → 影子提交只含 bypass.log（-o 限定），遗留文件不卷入、暂存状态保持
#   降级 — identity 缺失 → 登记提交失败显式提示（不崩溃不静默）
#   接线 — post-commit.sh 含登记段；synova-commit D508 追加已去重
# 沙箱: mktemp git 仓库 + 指向真实 hook 的委托（M13: git -c 一次性身份参数）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
# M13/D521: hook 上下文会导出 GIT_DIR/GIT_WORK_TREE——沙箱 git 命令必须剥掉
# （git -C 不覆盖 GIT_DIR env；D521-3 实证沙箱提交落到宿主分支）
# D554 补充: GIT_INDEX_FILE 同样会被 git hook 上下文导出（pre-commit hook 运行时
# 指向宿主 index）——ct-test-gate 只剥 GIT_DIR/GIT_WORK_TREE（D521-3 未根治泄漏），
# 测试内再剥 GIT_INDEX_FILE 防沙箱 commit 误用宿主 index。
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE
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
# M5: hook 内部影子提交用沙箱仓库身份——本机无全局 identity 时影子提交必败（环境依赖），
# 在沙箱仓库内配置（git -C 写沙箱 .git/config，不污染宿主——M13 边界内）
git -C "$SB" config user.name t
git -C "$SB" config user.email t@t
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

# 场景D（CT-43/D554）: 暂存区有遗留他人文件 → 影子登记提交只含 bypass.log，不卷走遗留
if grep -q -- '--no-verify -q -o -m' "$HOOK_SRC" && grep -q -- '"\$ROOT/.claude/bypass.log"' "$HOOK_SRC"; then
  ok "接线: 登记提交限定 -o + pathspec bypass.log（CT-43 修复在位）"
else
  no "登记提交未限定路径（-o/pathspec 缺失，卷带风险）"
fi
echo "foreign" > "$SB/foreign.txt"
git -C "$SB" add foreign.txt              # 模拟 D311 guard 阻断后遗留的他人 staged 文件
echo "feature-d" > "$SB/d.txt"
git -C "$SB" add d.txt                     # 本提交自己的文件（pathspec 提交要求已在索引）
echo "$(git -C "$SB" rev-parse HEAD)|$(date +%s)" > "$SB/.claude/last-precommit-success"
git -C "$SB" -c user.name=t -c user.email=t@t commit -q --no-verify -m "feat: real commit D" -- d.txt
SHADOW_FILES=$(git -C "$SB" show HEAD --name-only --format= 2>/dev/null) # swallow-ok: 场景D 前序提交失败时 show 报错属预期，由后续断言点名
if [ "$SHADOW_FILES" = ".claude/bypass.log" ]; then
  ok "影子登记提交只含 bypass.log（foreign.txt 未卷入）"
else
  no "影子提交卷走遗留文件: $SHADOW_FILES"
fi
if git -C "$SB" status --porcelain | grep -q '^A  foreign.txt'; then
  ok "foreign.txt 仍留在暂存区（-o 不消费他人 staged）"
else
  no "foreign.txt 暂存状态被破坏（$(git -C "$SB" status --porcelain | tr '\n' ' ' | head -c 80)）"
fi
if git -C "$SB" cat-file -e "HEAD^:foreign.txt" 2>/dev/null; then # swallow-ok: 文件不存在=断言目标状态（未卷入），非错误吞
  no "foreign.txt 被卷进真实提交（pathspec 失效）"
else
  ok "真实提交未包含 foreign.txt（pathspec 提交语义保持）"
fi

# 降级（-o 修复面外，保持不变）: 真实提交本身失败（identity 清空）→ hook 不触发、沙箱可继续操作
echo "feature-e" > "$SB/e.txt"
echo "$(git -C "$SB" rev-parse HEAD)|$(date +%s)" > "$SB/.claude/last-precommit-success"
git -C "$SB" add e.txt
git -C "$SB" -c user.name='' -c user.email='' commit --no-verify -m "feat: no-identity commit E" -- e.txt >/dev/null 2>&1 || true
git -C "$SB" status --porcelain -- e.txt | grep -q '^A' && ok "降级: 真实提交失败后沙箱状态可继续（e.txt 仍 staged）" || no "沙箱状态被破坏"

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
