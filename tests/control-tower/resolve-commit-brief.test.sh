#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# resolve-commit-brief.test.sh — D317 回退过滤测试（G12b CI 红根因）
#
# 覆盖（铁律 48：正常/降级/边界）:
#   1. 仅 legacy 不可解析 brief（无 #CRITERIA）→ 最终回退 exit 1（fail-open），
#      绝不静默返回坏 brief（修复前返回它 exit 0 = red）
#   2. 可解析 + 不可解析混存 → 返回最新可解析者（修复前返回最新=不可解析者 = red）
#   3. 仅可解析 brief → 返回该 brief（回归）
#   4. 过期 current-brief（日期≠今日）忽略 → 走回退
#
# 隔离: 临时 repo（mktemp -d + git init）— resolver 用 git rev-parse --show-toplevel
# 定位 ROOT；brief 放临时 repo 的 .claude/task-briefs/（mtime 今日 → ALL_TODAY 候选）
#
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RESOLVER="$REPO_DIR/scripts/workflow/resolve-commit-brief.sh"

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_exit() { # <got_exit> <want_exit> <msg>
  if [ "$1" -eq "$2" ]; then pass "$3 (exit=$1)"; else fail "$3 — exit=$1 期望 $2"; fi
}
assert_contains() { # <haystack> <needle> <msg>
  if echo "$1" | grep -qF "$2"; then pass "$3"; else fail "$3 — 未找到: $2"; fi
}
assert_not_contains() { # <haystack> <needle> <msg>
  if echo "$1" | grep -qF "$2"; then fail "$3 — 不应包含: $2"; else pass "$3"; fi
}

TODAY=$(date +%Y-%m-%d)

# resolver 修复后 exit 1 会触发外层 set -e → 统一在子 shell 捕获
run_resolver() { # <repo> → 设置 OUT + EC
  set +e
  OUT=$(cd "$1" && bash "$RESOLVER" "" 2>&1)
  EC=$?
  set -e
}

new_repo() {
  local d; d=$(mktemp -d)
  git -C "$d" init -q 2>/dev/null || true
  mkdir -p "$d/.claude/task-briefs"
  echo "$d"
}

# 可解析 brief（含 #CRITERIA）
make_parseable() { # <repo> <filename>
  cat > "$1/.claude/task-briefs/$2" <<EOF
## Q0: 定位 — 测试

## Q1: 调研 — 测试
#CRITERIA: A

## Q2: 范围 — 测试
做什么：
- scripts/test.sh

不做什么：
- 不改 scripts/test.sh

## Q3: 验收 — 测试

## 架构层: 基础设施
## Done 标准
- [ ] 可验证
EOF
}

# legacy brief（无 #CRITERIA，模拟 D286 旧模板）
make_legacy() { # <repo> <filename>
  cat > "$1/.claude/task-briefs/$2" <<EOF
## Q0: 定位 — legacy

## Q1: 调研 — legacy

## Q2: 范围 — legacy

## Q3: 验收 — legacy

## 架构层: L4
## Done 标准
- [ ] 入口可触达
EOF
}

echo "═══════════════════════════════════════════════════════════"
echo "  D317 resolve-commit-brief 回退过滤测试"
echo "═══════════════════════════════════════════════════════════"
echo ""

echo "── 1. 仅 legacy 不可解析 brief → 回退 exit 1 (fail-open) ──"
R1=$(new_repo)
make_legacy "$R1" "${TODAY}-legacy-only.md"
run_resolver "$R1"
assert_exit "$EC" 1 "仅 legacy 时回退 exit 1（不静默返回坏 brief）"
assert_not_contains "$OUT" "legacy-only" "输出不含不可解析 brief"
assert_exit "$([ -n "$OUT" ] && echo 0 || echo 1)" 1 "输出为空（无可用 brief）"
echo ""

echo "── 2. 可解析 + 不可解析混存 → 返回最新可解析者 ──"
R2=$(new_repo)
make_legacy "$R2" "${TODAY}-legacy-newer.md"       # 今日不可解析（修复前: 回退选中它 = red）
make_parseable "$R2" "2026-07-31-parseable-older.md" # 旧日期可解析（修复前: 被日期排序忽略）
run_resolver "$R2"
assert_exit "$EC" 0 "混存时回退成功"
assert_contains "$OUT" "parseable-older" "返回可解析 brief（跳过日期最新的不可解析者）"
assert_not_contains "$OUT" "legacy-newer" "不返回不可解析 brief"
echo ""

echo "── 3. 仅可解析 brief → 返回该 brief（回归）──"
R3=$(new_repo)
make_parseable "$R3" "${TODAY}-only-parseable.md"
run_resolver "$R3"
assert_exit "$EC" 0 "仅可解析时回退成功"
assert_contains "$OUT" "only-parseable" "返回可解析 brief"
echo ""

echo "── 4. 过期 current-brief（日期≠今日）忽略 → 走回退 ──"
R4=$(new_repo)
echo "2026-07-14-D83-bootstrap-startup-sequence.md" > "$R4/.claude/current-brief"
make_parseable "$R4" "${TODAY}-with-stale-cur.md"
run_resolver "$R4"
assert_exit "$EC" 0 "过期 current-brief 忽略后回退成功"
assert_contains "$OUT" "with-stale-cur" "回退返回今日可解析 brief（非陈旧 current-brief）"
assert_not_contains "$OUT" "D83" "不返回陈旧 current-brief"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  结果: $PASS 通过, $FAIL 失败"
if [ "$FAIL" -gt 0 ]; then
  echo "  Status: ❌ resolve-commit-brief 回退过滤测试未通过"
  echo "═══════════════════════════════════════════════════════════"
  exit 1
fi
echo "  Status: ✅ resolve-commit-brief 回退过滤测试全部通过"
echo "═══════════════════════════════════════════════════════════"
exit 0
