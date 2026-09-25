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

# ── 接线（Stage 2 / D970 已裁）: 登记只落 per-session；影子登记提交已删 ──
grep -q 'bypass-ledger.sh" append' "$HOOK_SRC" && ok "接线: per-session 登记（bypass-ledger.sh append）在位" || no "接线: per-session 登记接线缺失"
HOOK_SHADOW_N=$(grep -c "bypass COMMITTED 登记" "$HOOK_SRC" | tr -d '\n\r' || true)
[ "$HOOK_SHADOW_N" -eq 0 ] && ok "接线: 影子登记提交已删（Stage 2；grep -c=0）" || no "接线: 影子提交段仍在（与 Stage 2 不符）: $HOOK_SHADOW_N"

# 帮助: 建 sandbox git 仓库 + 委托 post-commit hook 指向真实脚本
make_sandbox() { # make_sandbox <dest>
  local d="$1"
  mkdir -p "$d/.claude" "$d/.git/hooks"
  git -C "$d" init -q
  # FIX-001 / D970 Stage 2 夹具补依赖: post-commit 以 `git rev-parse --show-toplevel` 为 ROOT
  #   调 `$ROOT/scripts/control-tower/bypass-ledger.sh`（:24 append / :97 read）。原夹具只建
  #   空仓 + 委派 hook ⇒ 沙箱内无该脚本 ⇒ 登记 exit=127（Stage 2 取消旧路径回退后由「静默
  #   降级」变硬失败）。此处把**真实脚本**提供进沙箱——属「夹具缺依赖」修复，不改断言语义。
  mkdir -p "$d/scripts/control-tower"
  cp "$REPO/scripts/control-tower/bypass-ledger.sh" "$d/scripts/control-tower/bypass-ledger.sh"
  # 沙箱 .gitignore: Stage 2 的 per-session 落点 .sessions/ + 本夹具自造的 scripts/
  #   都是运行期产物 ⇒ 不参与「树干净」判据（.sessions/ 由真实 .gitignore:42 忽略，此处等价复刻）
  printf '.sessions/\nscripts/\n' > "$d/.gitignore"
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
git -C "$SB" add .claude/bypass.log .gitignore
echo "seed" > "$SB/seed.txt"; git -C "$SB" add seed.txt
git -C "$SB" commit -q --no-verify -m "chore: seed"
echo "feature" > "$SB/feature.txt"; git -C "$SB" add feature.txt
# marker 模拟 pre-commit 真跑过（PASS_WAY=1）——写当前 HEAD(seed) + 时间戳
echo "$(git -C "$SB" rev-parse HEAD)|$(date +%s)" > "$SB/.claude/last-precommit-success"
# 注入缝（D735）: 固定 session 标识 ⇒ per-session 落点确定（hook 经 git 继承环境）
SYNO_SESSION_ID="c1-sandbox" git -C "$SB" commit -q -m "feat: real commit C1"
REAL_HASH=$(git -C "$SB" rev-parse HEAD)           # Stage 2 无影子提交 ⇒ 真实提交即 HEAD
LED1="$SB/.sessions/c1-sandbox/bypass.log"
grep -qF "HASH=$REAL_HASH" "$LED1" 2>/dev/null \
  && ok "C1 per-session 账本含本提交 HASH 的 COMMITTED（Stage 2 落点）" || no "C1 per-session COMMITTED 未登记: $LED1"
# 影子提交? 用 grep -c（读全量，避免 grep -q 提前退出→SIGPIPE→pipefail 误判为非确定性）
SHADOW_N=$(git -C "$SB" log --oneline --format=%s | grep -c "^chore: bypass COMMITTED 登记 (auto hook, D521)$" | tr -d '\n\r' || true)
[ "$SHADOW_N" -eq 0 ] && ok "C1 无影子提交（Stage 2 已删该机制）" || no "C1 出现影子提交（与 Stage 2 不符）: $SHADOW_N"
DIRTY=$(git -C "$SB" status --porcelain | grep -vE 'last-precommit-success' || true)
[ -z "$DIRTY" ] && ok "C1 树干净（无残留脏 bypass.log）" || no "C1 仍脏: $DIRTY"

# ═══ C2 降级: append 失败 → exit 2 fail-closed（不回退旧路径）+ 显式点名 ═══
echo ""
echo "── C2 降级（append 失败 → fail-closed，不回退旧路径）──"
SB2="$TMPD/c2"; make_sandbox "$SB2"
git -C "$SB2" config --local user.name "synova-mac"
git -C "$SB2" config --local user.email "claworg@users.noreply.github.com"
echo "seed" > "$SB2/.claude/bypass.log"; git -C "$SB2" add .claude/bypass.log .gitignore
echo "seed" > "$SB2/seed.txt"; git -C "$SB2" add seed.txt
git -C "$SB2" commit -q --no-verify -m "chore: seed"
LEGACY_BEFORE=$(wc -l < "$SB2/.claude/bypass.log" | tr -d ' ')
# 物理制造 append 失败: 落点目录的父路径被普通文件占位 ⇒ `mkdir -p` 必失败 ⇒ bypass-ledger.sh exit 2
echo "blocker" > "$SB2/.notadir"
echo "feature" > "$SB2/feature.txt"; git -C "$SB2" add feature.txt
echo "$(git -C "$SB2" rev-parse HEAD)|$(date +%s)" > "$SB2/.claude/last-precommit-success"
C2_ENV=(SYNO_SESSION_ID=c2-sandbox SYNO_BYPASS_LEDGER_DIR="$SB2/.notadir/sub")
C2_OUT=$(env "${C2_ENV[@]}" git -C "$SB2" commit -q -m "feat: real commit C2" 2>&1 || true)
echo "$C2_OUT" | grep -q "bypass 账本写入失败 (exit=2)" \
  && ok "C2 append 失败 exit=2 被显式点名（不静默）" || no "C2 未显式点名 append 失败: [${C2_OUT}]"
LEGACY_AFTER=$(wc -l < "$SB2/.claude/bypass.log" | tr -d ' ')
[ "$LEGACY_BEFORE" = "$LEGACY_AFTER" ] && ok "C2 未回退旧路径（.claude/bypass.log 行数不变: ${LEGACY_AFTER}）" || no "C2 回退了旧路径: $LEGACY_BEFORE → $LEGACY_AFTER"
grep -q "post-commit degraded: bypass 账本写入失败" "$SB2/.claude/degraded-events.log" 2>/dev/null \
  && ok "C2 degraded-events.log 留痕（可追溯）" || no "C2 无 degraded-events 留痕"
if [ "$(git -C "$SB2" log --oneline --format=%s | grep -c "^chore: bypass COMMITTED 登记 (auto hook, D521)$" | tr -d '\n\r' || true)" -ge 1 ]; then
  no "C2 不应生成影子提交（Stage 2 已删该机制）"
else
  ok "C2 未生成影子提交（Stage 2 语义）"
fi

# ═══ C3 幂等: 同一 HEAD 二次触发 → 不重复登记（Stage 2 用 read 幂等）═══
echo ""
echo "── C3 幂等（二次 post-commit 不重复登记）──"
SB3="$TMPD/c3"; make_sandbox "$SB3"
git -C "$SB3" config --local user.name "synova-mac"
git -C "$SB3" config --local user.email "claworg@users.noreply.github.com"
echo "seed" > "$SB3/.claude/bypass.log"; git -C "$SB3" add .claude/bypass.log .gitignore
echo "seed" > "$SB3/seed.txt"; git -C "$SB3" add seed.txt
git -C "$SB3" commit -q --no-verify -m "chore: seed"
echo "b" > "$SB3/b.txt"; git -C "$SB3" add b.txt
echo "$(git -C "$SB3" rev-parse HEAD)|$(date +%s)" > "$SB3/.claude/last-precommit-success"
SYNO_SESSION_ID="c3-sandbox" git -C "$SB3" commit -q -m "feat: real commit B"
HASH_C3=$(git -C "$SB3" rev-parse HEAD)
LED3="$SB3/.sessions/c3-sandbox/bypass.log"
N1=$(grep -cF "HASH=$HASH_C3" "$LED3" 2>/dev/null | tr -d '\n\r' || true)
# 二次触发同一 post-commit（迟到/重复 hook 场景，见 post-commit-marker.test.sh S6）
(cd "$SB3" && SYNO_SESSION_ID="c3-sandbox" bash "$SB3/.git/hooks/post-commit" >/dev/null 2>&1) || true
N2=$(grep -cF "HASH=$HASH_C3" "$LED3" 2>/dev/null | tr -d '\n\r' || true)
[ "$N1" = "1" ] && ok "C3 首次登记恰 1 条（read 幂等前置）" || no "C3 首次登记条数异常: $N1"
[ "$N2" = "1" ] && ok "C3 二次触发未重复登记（read 幂等生效）" || no "C3 重复登记: $N1 → $N2"

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
  B_INDEX_BEFORE=$(sha256sum "$TMPD/cloneB/.git/index" | awk '{print $1}')
  # A 里做一个真实 commit（配 identity）
  git -C "$TMPD/cloneA" config --local user.name "synova-mac"
  git -C "$TMPD/cloneA" config --local user.email "claworg@users.noreply.github.com"
  echo "a" > "$TMPD/cloneA/a.txt"; git -C "$TMPD/cloneA" add a.txt
  git -C "$TMPD/cloneA" commit -q -m "feat: A-only change"
  B_HEAD_AFTER=$(git -C "$TMPD/cloneB" rev-parse HEAD)
  B_INDEX_AFTER=$(sha256sum "$TMPD/cloneB/.git/index" | awk '{print $1}')
  [ "$B_HEAD_BEFORE" = "$B_HEAD_AFTER" ] && ok "C4 隔离: B 的 HEAD 零变化" || no "C4 B 的 HEAD 被污染: $B_HEAD_BEFORE vs $B_HEAD_AFTER"
  [ "$B_INDEX_BEFORE" = "$B_INDEX_AFTER" ] && ok "C4 隔离: B 的 index 零变化 (sha256)" || no "C4 B 的 index 被污染"
else
  no "C4 双 clone 建立失败"
fi

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
