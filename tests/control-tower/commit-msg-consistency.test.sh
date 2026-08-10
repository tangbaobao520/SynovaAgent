#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# commit-msg-consistency.test.sh — D328 提交声明-内容一致性门禁测试
#
# 背景: D320 劫持事故 — chore(D318) 提交把 D320 的 8 个文件带走, G12(范围)与
#       commit-msg(格式)两道门禁全过。根因: 无物理检查绑定"消息声明的 D#"
#       与"暂存文件认领 brief 的 D#"。
#
# 覆盖（铁律 48：正常/降级/边界/劫持/豁免）:
#   1. 真实劫持场景（red 基准）: D320 风格 brief 认领文件 + 消息 chore(D318)
#      → exit 1 硬阻断（修复前 exit 0 = 劫持复现）
#   2. 一致场景: 消息 chore(D320) == 认领 brief D# → exit 0 不误伤
#   3. 消息无 D# + 认领 brief 有 D# → exit 1
#   4. Merge 提交 → 跳过 exit 0
#   5. 认领 brief 无 D#（basename 无 D 号）→ fail-open exit 0
#   6. 无真实认领（resolver 回退到无关 brief）→ 跳过 exit 0 防假阳性
#
# 隔离: 每个用例独立临时 repo（mktemp -d + git init）+ 今日 mtime brief
#       （文件名带日期前缀 + #CRITERIA — resolver 最终回退路径的筛选条件）。
#       SUT 经真实仓库路径调用（commit-msg-check.sh 内部 BASH_SOURCE 自包含
#       定位 resolver/brief_parser — D317 教训, 临时 repo 无脚本目录）。
#
# 用法: bash tests/control-tower/commit-msg-consistency.test.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CHECKER="$REPO_DIR/scripts/commit-msg-check.sh"
TODAY=$(date +%Y-%m-%d)

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_exit() { if [ "$1" = "$2" ]; then pass "$3 (exit=$2)"; else fail "$3 — 期望 exit=$1 实际=$2"; fi; }

# ─── 辅助: 临时 repo 构造 ───
make_repo() {
  local r; r=$(mktemp -d /tmp/gtb-cmc-XXXXXX)
  git -C "$r" init -q -b main
  git -C "$r" config user.email test@synova.local
  git -C "$r" config user.name "Test Runner"
  mkdir -p "$r/.claude/task-briefs"
  echo "$r"
}

# 写 brief (文件名须带日期前缀 + #CRITERIA — resolver 最终回退的筛选条件)
write_brief() {
  local repo="$1" name="$2" include_path="$3"
  cat > "$repo/.claude/task-briefs/$name" <<EOF
## Q0: 定位 — 测试
### a) 项目拼图
测试 brief（D328 一致性门禁隔离）
### b) 文件审计
无
### c) 决策
无
## Q1: 调研
### a) 决策链
测试
### b) 执行约束
无
## Q2: 范围
做什么：
- $include_path
## Q3: 验收
入口：测试
处理：测试
结果：测试
## 架构层: 基础设施
#CRITERIA: A
## Done 标准
- [x] DS1 测试 — verify: echo 1
EOF
  # 强制 mtime = 今日（resolver 只认今日 mtime brief; 避免跨天假阴性）
  touch -d "$TODAY 12:00:00" "$repo/.claude/task-briefs/$name"
}

# 写消息文件并运行 SUT（在临时 repo 内执行 — git diff --cached 用 repo 上下文）
run_check() {
  local repo="$1" msg="$2"
  local mf; mf=$(mktemp /tmp/gtb-msg-XXXXXX)
  printf '%s\n' "$msg" > "$mf"
  local exit_code=0
  (cd "$repo" && bash "$CHECKER" "$mf") >/dev/null 2>&1 || exit_code=$?
  rm -f "$mf"
  echo "$exit_code"
}

echo "═══════════════════════════════════════════════════════════"
echo "  D328 commit 声明-内容一致性门禁 — 测试"
echo "  SUT: $CHECKER"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ════════════════════════════════════════════════════════════════
# 用例 1: 真实劫持场景（red 基准 — c576e2b 同类事故）
# ════════════════════════════════════════════════════════════════
echo "── 1. 真实劫持场景: 消息 chore(D318) + D320 brief 认领的文件 → exit 1 ──"
R1=$(make_repo)
write_brief "$R1" "$TODAY-D320-hijack.md" "scripts/control-tower/gen-task-board.py"
# c576e2b 劫持的 8 个文件 (D320 写集): stage 全部 → 消息声明 D318
for f in scripts/control-tower/gen-task-board.py \
         tests/control-tower/gen-task-board.test.py \
         docs/synova/coverage/board-override.yaml \
         docs/synova/coverage/README.md \
         docs/synova/DASHBOARD-CN.md \
         docs/synova/DASHBOARD.md \
         .gitignore; do
  mkdir -p "$R1/$(dirname "$f")"
  echo "content" > "$R1/$f"
  git -C "$R1" add "$f"
done
EXIT=$(run_check "$R1" "chore(D318): 双机身份与 hooks 可移植")
assert_exit 1 "$EXIT" "劫持拦截 (8 文件 + chore(D318) → 硬阻断)"
rm -rf "$R1"
echo ""

# ════════════════════════════════════════════════════════════════
# 用例 2: 一致场景 — 不误伤
# ════════════════════════════════════════════════════════════════
echo "── 2. 一致场景: 消息 chore(D320) == 认领 brief D# → exit 0 ──"
R2=$(make_repo)
write_brief "$R2" "$TODAY-D320-ok.md" "scripts/control-tower/gen-task-board.py"
mkdir -p "$R2/scripts/control-tower"
echo "content" > "$R2/scripts/control-tower/gen-task-board.py"
git -C "$R2" add scripts/control-tower/gen-task-board.py
EXIT=$(run_check "$R2" "chore(D320): 仪表盘 git 化生成器")
assert_exit 0 "$EXIT" "一致提交放行"
rm -rf "$R2"
echo ""

# ════════════════════════════════════════════════════════════════
# 用例 3: 消息无 D# + 认领 brief 有 D# → 阻断
# ════════════════════════════════════════════════════════════════
echo "── 3. 消息无 D# (chore: 无 scope) + 认领有 D# → exit 1 ──"
R3=$(make_repo)
write_brief "$R3" "$TODAY-D320-noscope.md" "scripts/control-tower/gen-task-board.py"
mkdir -p "$R3/scripts/control-tower"
echo "content" > "$R3/scripts/control-tower/gen-task-board.py"
git -C "$R3" add scripts/control-tower/gen-task-board.py
EXIT=$(run_check "$R3" "chore: 无 scope 提交")
assert_exit 1 "$EXIT" "无 D# 声明阻断"
rm -rf "$R3"
echo ""

# ════════════════════════════════════════════════════════════════
# 用例 4: Merge 豁免
# ════════════════════════════════════════════════════════════════
echo "── 4. Merge 提交 → 跳过 exit 0 ──"
R4=$(make_repo)
write_brief "$R4" "$TODAY-D320-merge.md" "scripts/control-tower/gen-task-board.py"
mkdir -p "$R4/scripts/control-tower"
echo "content" > "$R4/scripts/control-tower/gen-task-board.py"
git -C "$R4" add scripts/control-tower/gen-task-board.py
EXIT=$(run_check "$R4" "Merge branch 'feature-x' into main")
assert_exit 0 "$EXIT" "Merge 豁免"
rm -rf "$R4"
echo ""

# ════════════════════════════════════════════════════════════════
# 用例 5: 认领 brief 无 D# → fail-open
# ════════════════════════════════════════════════════════════════
echo "── 5. 认领 brief 无 D# (basename 无 D 号) → fail-open exit 0 ──"
R5=$(make_repo)
write_brief "$R5" "$TODAY-no-number.md" "scripts/control-tower/gen-task-board.py"
mkdir -p "$R5/scripts/control-tower"
echo "content" > "$R5/scripts/control-tower/gen-task-board.py"
git -C "$R5" add scripts/control-tower/gen-task-board.py
EXIT=$(run_check "$R5" "chore(D999): 无关任务提交")
assert_exit 0 "$EXIT" "无 D# brief 跳过"
rm -rf "$R5"
echo ""

# ════════════════════════════════════════════════════════════════
# 用例 6: 无真实认领 → 防假阳性
# ════════════════════════════════════════════════════════════════
echo "── 6. 无真实认领 (resolver 回退到无关 brief) → 跳过 exit 0 ──"
R6=$(make_repo)
write_brief "$R6" "$TODAY-D320-unrelated.md" "scripts/other/xyz.py"
mkdir -p "$R6/scripts/control-tower"
echo "content" > "$R6/scripts/control-tower/gen-task-board.py"
git -C "$R6" add scripts/control-tower/gen-task-board.py
EXIT=$(run_check "$R6" "chore(D320): 无关文件提交")
assert_exit 0 "$EXIT" "无真实认领跳过 (防假阳性)"
rm -rf "$R6"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  结果: $PASS 通过 / $FAIL 失败"
echo "═══════════════════════════════════════════════════════════"
[ "$FAIL" = "0" ] || exit 1
