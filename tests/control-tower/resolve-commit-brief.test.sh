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
run_resolver() { # <repo> [staged] → 设置 OUT + EC
  set +e
  OUT=$(cd "$1" && bash "$RESOLVER" "${2:-}" 2>&1)
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

echo "── 5. 日期窗口 +1 天：明日（UTC+8 vs CI UTC）brief 认领更多文件 → 胜出（D559/PR #295 实证）──"
R5=$(new_repo)
TOMORROW=$(python3 -c "from datetime import date,timedelta; print((date.today()+timedelta(days=1)).isoformat())" 2>/dev/null || echo "")
TWO_AGO=$(python3 -c "from datetime import date,timedelta; print((date.today()-timedelta(days=2)).isoformat())" 2>/dev/null || echo "")
# 明日 brief 认领 2 个文件；今日 brief 只认领 1 个——窗口失效时明日被排除、今日以 n=1 胜出（错误结果）
cat > "$R5/.claude/task-briefs/${TOMORROW}-tomorrow-claims2.md" <<EOF
## Q0: 定位 — 明日双文件认领

## Q1: 调研 — 明日双文件认领
#CRITERIA: A

## Q2: 范围 — 明日双文件认领
做什么：
- scripts/a.sh
- scripts/b.sh

不做什么：
- 不改 docs/other.md

## Q3: 验收 — 明日双文件认领

## 架构层: 基础设施
## Done 标准
- [ ] 可验证
EOF
cat > "$R5/.claude/task-briefs/${TODAY}-today-claims1.md" <<EOF
## Q0: 定位 — 今日单文件认领

## Q1: 调研 — 今日单文件认领
#CRITERIA: A

## Q2: 范围 — 今日单文件认领
做什么：
- scripts/a.sh

不做什么：
- 不改 docs/other.md

## Q3: 验收 — 今日单文件认领

## 架构层: 基础设施
## Done 标准
- [ ] 可验证
EOF
run_resolver "$R5" "scripts/a.sh
scripts/b.sh"
assert_exit "$EC" 0 "明日 brief 认领成功"
assert_contains "$OUT" "tomorrow-claims2" "窗口内明日 brief 以认领数胜出（UTC 时区容差）"
assert_not_contains "$OUT" "today-claims1" "不误选认领更少的今日 brief"
echo ""

echo "── 6. 窗口边界：前日（today-2）brief 不参与认领（防窗口过度放宽）──"
R6=$(new_repo)
cat > "$R6/.claude/task-briefs/${TWO_AGO}-stale-claims2.md" <<EOF
## Q0: 定位 — 前日双文件认领

## Q1: 调研 — 前日双文件认领
#CRITERIA: A

## Q2: 范围 — 前日双文件认领
做什么：
- scripts/a.sh
- scripts/b.sh

不做什么：
- 不改 docs/other.md

## Q3: 验收 — 前日双文件认领

## 架构层: 基础设施
## Done 标准
- [ ] 可验证
EOF
cat > "$R6/.claude/task-briefs/${TODAY}-today-claims1b.md" <<EOF
## Q0: 定位 — 今日单文件认领

## Q1: 调研 — 今日单文件认领
#CRITERIA: A

## Q2: 范围 — 今日单文件认领
做什么：
- scripts/a.sh

不做什么：
- 不改 docs/other.md

## Q3: 验收 — 今日单文件认领

## 架构层: 基础设施
## Done 标准
- [ ] 可验证
EOF
run_resolver "$R6" "scripts/a.sh
scripts/b.sh"
assert_exit "$EC" 0 "今日 brief 认领成功"
assert_contains "$OUT" "today-claims1b" "窗口外（today-2）brief 不参与，今日 brief 胜出"
assert_not_contains "$OUT" "stale-claims2" "前日 brief 被窗口排除（±1 天边界）"
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
