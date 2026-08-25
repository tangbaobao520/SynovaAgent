#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# tag-ancestry.test.sh — D521/不变量1: tag 校验范围收窄（孤儿 tag 不拦他分支）
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常(放) — 孤儿 tag（非 HEAD 祖先，历史事故/其他分支）→ push 检查通过
#   正常(拦) — 本分支 tag（HEAD 祖先）非 origin/main 祖先 → 硬阻断（未合并打 tag）
#   正常(放) — tag 在 origin/main 上 → 通过（main 锚点合法）
#   降级     — origin/main 不可解析 → 跳过收窄段（显式降级，不静默）
#   接线     — check_tag_ancestry 含收窄逻辑（HEAD 祖先才查 origin/main）
# 沙箱: mktemp git 仓库（M13: git -c 一次性身份；update-ref 构造 refs/remotes/origin/main）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
# M13/D521: hook 上下文会导出 GIT_DIR/GIT_WORK_TREE——沙箱 git 命令必须剥掉
# （git -C 不覆盖 GIT_DIR env；D521-3 实证沙箱提交落到宿主分支）
unset GIT_DIR GIT_WORK_TREE
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PP="$REPO/scripts/pre-push-check.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT

echo "=== D521 不变量1: tag 锚点收窄 ==="

# ── 接线 ──
grep -q 'is-ancestor "$t" origin/main' "$PP" && grep -q 'is-ancestor "$t" HEAD' "$PP" \
  && ok "接线: HEAD 祖先 ∩ origin/main 祖先 双段检查存在" || no "收窄逻辑缺失"

mk() { # <dir> — 建沙箱仓库: base commit + origin/main ref + VERSION.md
  local R="$1"; mkdir -p "$R/.codex/control-tower"
  git -C "$R" init -q
  git -C "$R" -c user.name=t -c user.email=t@t commit -q --allow-empty -m base
  git -C "$R" update-ref refs/remotes/origin/main HEAD
  printf '## V9.9.9 (test)\n' > "$R/.codex/control-tower/VERSION.md"
}

run_check() { # <repo> → OUT + EC
  OUT=$(cd "$1" && SYNO_TAG_ONLY=1 bash "$PP" 2>&1); EC=$?
}

# ── 场景A: 孤儿 tag（不可达提交）→ 不拦 ──
RA="$TMPD/ra"; mk "$RA"
git -C "$RA" -c user.name=t -c user.email=t@t commit -q --allow-empty -m feat
ORPHAN=$(git -C "$RA" commit-tree $(git -C "$RA" rev-parse HEAD^{tree}) -m orphan-blob)
git -C "$RA" tag V4.7.1 "$ORPHAN"   # 孤儿提交（非 HEAD 祖先、非 main 祖先）
git -C "$RA" tag V9.9.9 refs/remotes/origin/main  # 正常版本 tag 在 main 上（隔离 D319，只测孤儿豁免）
run_check "$RA"
[ "$EC" -eq 0 ] && ok "孤儿 tag（V4.7.1 类）不拦本分支 push" || no "孤儿 tag 仍拦: EC=$EC"
echo "$OUT" | grep -q "V4.7.1 不是 HEAD 祖先" && no "旧报错文案残留（说明没跳过）" || ok "孤儿 tag 被跳过而非点名"

# ── 场景B: 本分支 tag 非 origin/main 祖先（未合并打 tag）→ 拦 ──
RB="$TMPD/rb"; mk "$RB"
git -C "$RB" -c user.name=t -c user.email=t@t commit -q --allow-empty -m feat
git -C "$RB" tag V9.9.9 HEAD   # HEAD 祖先但非 origin/main 祖先
run_check "$RB"
[ "$EC" -eq 1 ] && ok "未合并分支 tag（HEAD∩非main祖先）→ 硬阻断" || no "应拦, EC=$EC"
echo "$OUT" | grep -q "不在 origin/main 上" && ok "报错指明 tag 未在 main 上" || no "报错文案不含 main 锚点: $(echo "$OUT" | grep -E '❌|V9' | head -2)"

# ── 场景C: tag 在 origin/main 上 → 放 ──
RC="$TMPD/rc"; mk "$RC"
git -C "$RC" tag V9.9.9 refs/remotes/origin/main
run_check "$RC"
[ "$EC" -eq 0 ] && ok "main 可达 tag → 通过" || no "main tag 被误拦: EC=$EC"

# ── 降级: origin/main 不可解析 → 显式降级跳过收窄段 ──
RD="$TMPD/rd"; mk "$RD"
git -C "$RD" update-ref -d refs/remotes/origin/main
git -C "$RD" -c user.name=t -c user.email=t@t commit -q --allow-empty -m feat
git -C "$RD" tag V9.9.9 HEAD
run_check "$RD"
[ "$EC" -eq 0 ] && ok "origin/main 缺失 → 降级不拦（沙箱/离线语义）" || no "缺失 origin/main 误拦: EC=$EC"
echo "$OUT" | grep -q "origin/main 不可解析" && ok "降级显式提示（铁律 11 不静默）" || no "缺降级提示"

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
