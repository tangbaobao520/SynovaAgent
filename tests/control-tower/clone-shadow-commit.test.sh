#!/usr/bin/env bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# clone-shadow-commit.test.sh — D540 影子提交 clone 环境集成 harness（物理断言）
#
# 目标: 凡「影子提交在独立 clone 环境照常」都用真实沙箱 git + 真实 post-commit.sh 验证，
#       禁静态 grep 冒充（M2 红线）。identity 配置为前置（post-commit.sh L87 降级路径被堵）。
#
# 覆盖矩阵（铁律 48 正常/降级/边界 + 隔离）:
#   C1 正常: identity 配置（模拟 _ensure_clone_git_config）→ 真实 commit →
#            bypass.log 含 COMMITTED + 影子提交生成 + 树干净
#   C2 降级: 无 identity → 影子提交 git commit 失败 → L87「identity 未配置」消息 +
#            不生成影子提交（降级不洗白）
#   C3 防递归: 影子提交自身不再触发影子提交（git log 中 "chore: bypass COMMITTED 登记" 只 1 次）
#   C4 隔离: 双独立 clone，A commit → B 的 HEAD/index 零变化（sha256 指纹）
#
# 沙箱: mktemp git 仓库 + 指向真实 post-commit.sh 的委托 hook（M13: git -c 一次性身份参数）。
# 退出码: 0 = 全部通过
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
# M13/D521: hook 上下文会导出 GIT_DIR/GIT_WORK_TREE——沙箱 git 命令必须剥掉
unset GIT_DIR GIT_WORK_TREE
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOK_SRC="$REPO/scripts/hooks/post-commit.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD" 2>/dev/null || true' EXIT

echo "=== D540 clone-shadow-commit: 影子提交 clone 环境物理断言 ==="

# ── 接线: post-commit.sh 影子提交段真实存在（本单验证对象，不改）──
grep -q "bypass COMMITTED 登记" "$HOOK_SRC" && ok "接线: post-commit.sh 含影子提交段" || no "接线: 影子提交段缺失"

# 帮助: 建 sandbox git 仓库 + 委托 post-commit hook 指向真实脚本
make_sandbox() { # make_sandbox <dest>
  local d="$1"
  mkdir -p "$d/.claude" "$d/.git/hooks"
  git -C "$d" init -q
  printf '#!/bin/bash\nexec bash "%s"\n' "$HOOK_SRC" > "$d/.git/hooks/post-commit"
  chmod +x "$d/.git/hooks/post-commit"
}

# ═══ C1 正常: identity 配置 → 真实 commit → COMMITTED + 影子提交 + 树干净 ═══
echo ""
echo "── C1 正常（identity 配置 → 影子提交触发）──"
SB="$TMPD/c1"; make_sandbox "$SB"
# 模拟 _ensure_clone_git_config: local 设 identity（不覆盖已有、仅缺失才写语义由 C 用 local 体现）
git -C "$SB" config --local user.name "synova-mac"
git -C "$SB" config --local user.email "claworg@users.noreply.github.com"
# 预创建 + 暂存 .claude/bypass.log 到 seed（post-commit 影子提交须在已跟踪文件上 append，
#   否则 git status/内层 commit 行为不稳——post-commit.test.sh 同款可靠流程）
echo "seed" > "$SB/.claude/bypass.log"
git -C "$SB" add .claude/bypass.log
echo "seed" > "$SB/seed.txt"; git -C "$SB" add seed.txt
git -C "$SB" commit -q --no-verify -m "chore: seed"
echo "feature" > "$SB/feature.txt"; git -C "$SB" add feature.txt
# marker 模拟 pre-commit 真跑过（PASS_WAY=1）——写当前 HEAD(seed) + 时间戳
echo "$(git -C "$SB" rev-parse HEAD)|$(date +%s)" > "$SB/.claude/last-precommit-success"
git -C "$SB" commit -q -m "feat: real commit C1"   # 真实 commit（用 local identity，非 -c）
REAL_HASH=$(git -C "$SB" rev-parse HEAD^)          # 影子已是 HEAD，真实提交 = HEAD^
grep -q "COMMITTED | pre-commit PASS (hook 层登记) | HASH=$REAL_HASH" "$SB/.claude/bypass.log" \
  && ok "C1 bypass.log 含本提交 HASH 的 COMMITTED" || no "C1 COMMITTED 未登记"
# 影子提交已生成? 用 grep -c（读全量，避免 grep -q 提前退出→SIGPIPE→pipefail 误判为非确定性）
SHADOW_N=$(git -C "$SB" log --oneline --format=%s | grep -c "^chore: bypass COMMITTED 登记 (auto hook, D521)$" | tr -d '\n\r' || true)
[ "$SHADOW_N" -ge 1 ] && ok "C1 影子提交已生成" || no "C1 影子提交缺失"
DIRTY=$(git -C "$SB" status --porcelain | grep -vE 'last-precommit-success' || true)
[ -z "$DIRTY" ] && ok "C1 树干净（无残留脏 bypass.log）" || no "C1 仍脏: $DIRTY"

# ═══ C2 降级: 无 identity → 影子提交失败 → L87 消息 + 不生成影子提交 ═══
echo ""
echo "── C2 降级（无 identity → L87「identity 未配置」）──"
SB2="$TMPD/c2"; make_sandbox "$SB2"
# clone 无身份配置（不设 local user.*）。真实提交用一次性 -c 身份创建（不持久化 identity——
# 模拟 clone 无 global/local 配置。注意: git -c 会经 GIT_CONFIG_PARAMETERS 传播给自动 hook，
# 故 feature commit 时临时禁用 hook，避免自动影子提交提前生成——降级路径须手动触发。
# 另: git 默认会从 OS 自动派生身份（username@hostname）→ 影子提交竟能成功；
#     要真实触发 L87（git commit 因无法确定身份而失败），须 user.useConfigOnly=true
#     （git 不再自动派生、只认显式身份配置）——这是触发 post-commit L87 的诚实物理条件。
git -C "$SB2" config --local user.useConfigOnly true
echo "seed" > "$SB2/seed.txt"; git -C "$SB2" add seed.txt
git -C "$SB2" -c user.name=t -c user.email=t@t commit -q --no-verify -m "chore: seed"   # 无 marker → no shadow
# feature commit: 临时禁用 hook（防 -c identity 传播→自动影子提交）
mv "$SB2/.git/hooks/post-commit" "$SB2/.git/hooks/post-commit.bak"
echo "feature" > "$SB2/feature.txt"; git -C "$SB2" add feature.txt
SEED_SHA=$(git -C "$SB2" rev-parse HEAD)
echo "$SEED_SHA|$(date +%s)" > "$SB2/.claude/last-precommit-success"
git -C "$SB2" -c user.name=t -c user.email=t@t commit -q -m "feat: real commit C2"
mv "$SB2/.git/hooks/post-commit.bak" "$SB2/.git/hooks/post-commit"
# 手动触发 post-commit，且清空身份环境（模拟 clone 无 identity + 无 -c 传播 + useConfigOnly）
C2_OUT=$(cd "$SB2" && env -u GIT_CONFIG_PARAMETERS -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL \
      -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL bash "$SB2/.git/hooks/post-commit" 2>&1)
C2_L87_N=$(echo "$C2_OUT" | grep -c "identity 未配置" | tr -d '\n\r' || true)
[ "$C2_L87_N" -ge 1 ] \
  && ok "C2 L87 降级消息（identity 未配置）已触发" || no "C2 L87 消息缺失: [$C2_OUT]"
if [ "$(git -C "$SB2" log --oneline --format=%s | grep -c "^chore: bypass COMMITTED 登记 (auto hook, D521)$" | tr -d '\n\r' || true)" -ge 1 ]; then
  no "C2 不应生成影子提交（降级不洗白）"
else
  ok "C2 未生成影子提交（降级不洗白）"
fi

# ═══ C3 防递归: 影子提交自身不再触发影子提交 ═══
echo ""
echo "── C3 防递归（影子不登记影子）──"
SB3="$TMPD/c3"; make_sandbox "$SB3"
git -C "$SB3" config --local user.name "synova-mac"
git -C "$SB3" config --local user.email "claworg@users.noreply.github.com"
echo "seed" > "$SB3/.claude/bypass.log"
git -C "$SB3" add .claude/bypass.log
echo "seed" > "$SB3/seed.txt"; git -C "$SB3" add seed.txt
git -C "$SB3" commit -q --no-verify -m "chore: seed"
echo "b" > "$SB3/b.txt"; git -C "$SB3" add b.txt
echo "$(git -C "$SB3" rev-parse HEAD)|$(date +%s)" > "$SB3/.claude/last-precommit-success"
git -C "$SB3" commit -q -m "feat: real commit B"
# grep -c 无匹配输出 0 且 exit 1 → 用 tr 兜底（ctrl-tower 模式 4）
COUNT=$(git -C "$SB3" log --oneline --format=%s | grep -c "^chore: bypass COMMITTED 登记 (auto hook, D521)$" | tr -d '\n\r' || true)
[ "$COUNT" -eq 1 ] && ok "C3 防递归: 影子提交仅 1 次 (count=$COUNT)" || no "C3 影子递归: count=$COUNT"

# ═══ C4 隔离: 双独立 clone，A commit → B 的 HEAD/index 零变化 ═══
echo ""
echo "── C4 隔离（双 clone 互不污染 index/HEAD）──"
BASE="$TMPD/base"; make_sandbox "$BASE"
git -C "$BASE" config --local user.name "synova-mac"
git -C "$BASE" config --local user.email "claworg@users.noreply.github.com"
echo "base" > "$BASE/base.txt"; git -C "$BASE" add base.txt
git -C "$BASE" commit -q --no-verify -m "chore: base"
# 两个独立 clone（各自独立 .git）
git clone -q "file://$BASE" "$TMPD/cloneA" 2>/dev/null || no "clone A 失败"
git clone -q "file://$BASE" "$TMPD/cloneB" 2>/dev/null || no "clone B 失败"
if [ -d "$TMPD/cloneA/.git" ] && [ -d "$TMPD/cloneB/.git" ]; then
  B_HEAD_BEFORE=$(git -C "$TMPD/cloneB" rev-parse HEAD)
  B_INDEX_BEFORE=$(sha256sum "$TMPD/cloneB/.git/index" 2>/dev/null | awk '{print $1}')
  # A 里做一个真实 commit（配 identity）
  git -C "$TMPD/cloneA" config --local user.name "synova-mac"
  git -C "$TMPD/cloneA" config --local user.email "claworg@users.noreply.github.com"
  echo "a" > "$TMPD/cloneA/a.txt"; git -C "$TMPD/cloneA" add a.txt
  git -C "$TMPD/cloneA" commit -q -m "feat: A-only change"
  B_HEAD_AFTER=$(git -C "$TMPD/cloneB" rev-parse HEAD)
  B_INDEX_AFTER=$(sha256sum "$TMPD/cloneB/.git/index" 2>/dev/null | awk '{print $1}')
  [ "$B_HEAD_BEFORE" = "$B_HEAD_AFTER" ] && ok "C4 隔离: B 的 HEAD 零变化" || no "C4 B 的 HEAD 被污染: $B_HEAD_BEFORE vs $B_HEAD_AFTER"
  [ "$B_INDEX_BEFORE" = "$B_INDEX_AFTER" ] && ok "C4 隔离: B 的 index 零变化 (sha256)" || no "C4 B 的 index 被污染"
else
  no "C4 双 clone 建立失败"
fi

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
