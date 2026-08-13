#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# tag-consistency.test.sh — D319 git tag 自动化测试
#
# 覆盖（铁律 48：正常/降级/边界）:
#   1. VERSION.md 有 V9.9.9 但无 tag → pre-push 检查 exit 1（硬阻断，red 核心）
#   2. 打 tag 后 pre-push 检查 exit 0（回归）
#   3. synova-commit 提交成功后自动建 annotated tag（VERSION.md 最新版）
#   4. annotated tag 消息含 "auto-tag"（git for-each-ref 可读）
#   5. VERSION.md 无版本标题 → fail-open exit 0（边界）
#   6. VERSION.md 缺失 → fail-open exit 0（边界）
#   7. version.log 自动追加（SYNO_CT_DIR 隔离断言）
#
# 隔离: mktemp -d 临时 repo + git init；
#       SYNO_TAG_ONLY=1 → pre-push 只跑 D319 tag 检查（快速路径）；
#       SYNO_VERSION_MD 注入 VERSION.md 路径；
#       SYNO_PRE_COMMIT 指向不存在文件 → synova-commit 走降级路径
#       （exit 2 但 commit 成功，tag 逻辑两路径共用）。
# 用法: bash tests/control-tower/tag-consistency.test.sh
# 退出码: 0 = 全部通过
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PRE_PUSH="$REPO_DIR/scripts/pre-push-check.sh"
SYNOVA_COMMIT="$REPO_DIR/scripts/control-tower/synova-commit"
CT_TMP="$REPO_DIR/.codex/control-tower/tmp"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_exit() { # <got_exit> <want_exit> <msg>
  if [ "$1" -eq "$2" ]; then pass "$3 (exit=$1)"; else fail "$3 — exit=$1 期望 $2"; fi
}
assert_contains() { # <haystack> <needle> <msg>
  if echo "$1" | grep -qF "$2"; then pass "$3"; else fail "$3 — 未找到: $2"; fi
}

# 隔离 CT 日志目录（version.log 断言目标）
CT_ISOLATE="$CT_TMP/tc-ct"
rm -rf "$CT_ISOLATE"
mkdir -p "$CT_ISOLATE"

# ── 新建临时 repo + 伪造 VERSION.md ──
new_repo() { # <dir> <version>
  mkdir -p "$1"
  git -C "$1" init -q 2>/dev/null || true
  git -C "$1" config user.name "test" 2>/dev/null || true
  git -C "$1" config user.email "test@test" 2>/dev/null || true
  mkdir -p "$1/.codex/control-tower"
  printf '## %s (test)\n' "$2" > "$1/.codex/control-tower/VERSION.md"
}

run_pre_push_tag_only() { # <repo_dir> [VERSION_MD] → 设置 OUT + EC
  local repo="$1" vmd="$2"
  set +e
  if [ -n "$vmd" ]; then
    OUT=$(cd "$repo" && SYNO_TAG_ONLY=1 SYNO_VERSION_MD="$vmd" bash "$PRE_PUSH" 2>&1)
  else
    OUT=$(cd "$repo" && SYNO_TAG_ONLY=1 bash "$PRE_PUSH" 2>&1)
  fi
  EC=$?
  set -e
}

echo "═══════════════════════════════════════════════════════════"
echo "  D319 tag-consistency 测试 — git tag 自动化"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── 用例 1: VERSION.md 有 V9.9.9 但无 tag → 硬阻断 exit 1 ──
echo "── 1. 版本无 tag → pre-push 硬阻断 (exit 1) ──"
R1=$(mktemp -d)
new_repo "$R1" "V9.9.9"
run_pre_push_tag_only "$R1" ""
assert_exit "$EC" 1 "VERSION.md V9.9.9 无 tag → exit 1"
assert_contains "$OUT" "缺少对应 tag" "输出含缺 tag 提示"
echo ""

# ── 用例 2: 打 tag 后 → exit 0 ──
echo "── 2. 打 tag 后 → exit 0 ──"
R2=$(mktemp -d)
new_repo "$R2" "V9.9.9"
echo "base" > "$R2/base.md"
git -C "$R2" add base.md 2>/dev/null || true
git -C "$R2" commit -q -m "base" 2>/dev/null || true
git -C "$R2" tag V9.9.9 2>/dev/null || true
run_pre_push_tag_only "$R2" ""
assert_exit "$EC" 0 "已有 tag → exit 0"
echo ""

# ── 用例 3: synova-commit 提交成功后自动建 tag ──
echo "── 3. synova-commit 提交后自动建 tag ──"
R3=$(mktemp -d)
new_repo "$R3" "V9.9.9"
echo "hello" > "$R3/x.md"
set +e
OUT3=$(cd "$R3" && SYNO_PRE_COMMIT="$R3/.missing-pre-commit" SYNO_CT_DIR="$CT_ISOLATE" \
  bash "$SYNOVA_COMMIT" --task-id "D319-test" --agent "test" --message "test: tag auto" --files "x.md" 2>&1)
EC3=$?
set -e
assert_exit "$EC3" 2 "降级路径 commit 完成 (exit 2)"
TAGS3=$(git -C "$R3" tag -l)
assert_contains "$TAGS3" "V9.9.9" "自动打 tag: git tag -l 含 V9.9.9"
assert_contains "$OUT3" "自动打 tag" "输出含自动打 tag 提示"
echo ""

# ── 用例 4: annotated tag 消息含 auto-tag ──
echo "── 4. annotated tag 可审计 (消息含 auto-tag) ──"
OBJTYPE=$(git -C "$R3" for-each-ref refs/tags --format='%(objecttype)' 2>/dev/null) # swallow-ok: 测试断言数据读取, 失败返回空串断言自然失败
assert_contains "$OBJTYPE" "tag" "tag 为 annotated (objecttype=tag)"
TAGMSG=$(git -C "$R3" for-each-ref refs/tags --format='%(contents)' 2>/dev/null) # swallow-ok: 测试断言数据读取, 失败返回空串断言自然失败
assert_contains "$TAGMSG" "auto-tag" "tag 消息含 auto-tag"
echo ""

# ── 用例 5: VERSION.md 无版本标题 → fail-open exit 0 ──
echo "── 5. VERSION.md 无版本标题 → fail-open ──"
R5=$(mktemp -d)
new_repo "$R5" "V9.9.9"
printf '# 无版本标题\n普通文本\n' > "$R5/.codex/control-tower/VERSION.md"
run_pre_push_tag_only "$R5" ""
assert_exit "$EC" 0 "无版本标题 → exit 0 (fail-open)"
echo ""

# ── 用例 6: VERSION.md 缺失 → fail-open exit 0 ──
echo "── 6. VERSION.md 缺失 → fail-open ──"
R6=$(mktemp -d)
new_repo "$R6" "V9.9.9"
rm -f "$R6/.codex/control-tower/VERSION.md"
run_pre_push_tag_only "$R6" ""
assert_exit "$EC" 0 "VERSION.md 缺失 → exit 0 (fail-open)"
echo ""

# ── 用例 7: version.log 自动追加 (SYNO_CT_DIR 隔离) ──
echo "── 7. version.log 自动追加 ──"
if [ -f "$CT_ISOLATE/logs/version.log" ]; then
  TAIL=$(tail -1 "$CT_ISOLATE/logs/version.log")
  assert_contains "$TAIL" '"version": "9.9.9"' "version.log 尾行 = 9.9.9"
  assert_contains "$TAIL" '"changes": "auto-tag' "version.log 含 auto-tag changes"
else
  fail "version.log 未生成 ($CT_ISOLATE/logs/version.log)"
fi
echo ""

# ── 清理 ──
rm -rf "$R1" "$R2" "$R3" "$R5" "$R6" 2>/dev/null || true

echo "═══════════════════════════════════════════════════════════"
echo "  结果: $PASS 通过, $FAIL 失败"
if [ "$FAIL" -gt 0 ]; then
  echo "  Status: ❌ tag-consistency 测试未通过"
  echo "═══════════════════════════════════════════════════════════"
  exit 1
fi
echo "  Status: ✅ tag-consistency 测试全部通过"
echo "═══════════════════════════════════════════════════════════"
exit 0
