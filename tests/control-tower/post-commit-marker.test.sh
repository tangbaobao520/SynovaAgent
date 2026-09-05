#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# post-commit-marker.test.sh — D366 单测: post-commit marker head|ts 对账 (CT-29 修复)
#
# 缺陷 B 回归 (dev doc §4 RED 场景 2): 全局单例 marker 被并发 session 的
#   post-commit rm 后, 另一 session 的正常提交被误判 detected-bypass。
#
# 测试策略: 在临时 git 仓库运行**真实** scripts/hooks/post-commit.sh
#   (cp 到 .githooks + core.hooksPath), 不 mock 判定逻辑。
#   覆盖: head 匹配=pass / head 不匹配=detected-bypass / 无 marker=detected-bypass /
#         超时=possible-bypass / legacy 纯时间戳格式 / CT-29 交错时序 (S6) /
#         D421 三判: amend (S7) / 并发祖先 (S8) / 真绕过 stale marker 仍被 freshness 抓 (S9)。
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

TEST_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REAL_HOOK="$TEST_ROOT/scripts/hooks/post-commit.sh"
PASS=0
FAIL=0

ok() { PASS=$((PASS + 1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ✗ $1"; }
check() { # check <描述> <期望> <实际>
  if [ "$2" = "$3" ]; then ok "$1"; else fail "$1 (期望 [$2] 实际 [$3])"; fi
}
check_contains() { # check_contains <描述> <文件> <子串>
  if [ -f "$2" ] && grep -qF "$3" "$2"; then ok "$1"; else fail "$1 (未找到 [$3] 于 $2)"; fi
}
log_lines() { # bypass.log 行数, 不存在 = 0
  if [ -f "$1" ]; then wc -l < "$1" | tr -d ' \r'; else echo 0; fi
}

if [ ! -f "$REAL_HOOK" ]; then
  echo "  ✗ 生产脚本缺失: $REAL_HOOK"
  exit 1
fi

TMPROOT=$(mktemp -d)
trap 'rm -rf "$TMPROOT"' EXIT
NO_HOOKS="$TEST_ROOT/nonexistent-hooks-path"   # 显式覆盖全局 hooksPath → 无 hook 提交

new_repo() { # new_repo <名字> — init + 初始提交 (无 hook) + .claude + hook 安装
  REPO="$TMPROOT/$1"
  # D543: 显式 -b main——git init 默认分支名随宿主配置漂移（本地 main / CI runner master），
  #   S10 的 `checkout main` 依赖此名。密封性修复（M12 同族：测试不得依赖宿主 git 配置）。
  git -C "$TMPROOT" init -q -b main "$REPO" 2>/dev/null || {
    git -C "$TMPROOT" init -q "$REPO"
    git -C "$REPO" branch -q -m main 2>/dev/null || true
  }
  git -C "$REPO" config user.email "test@test.local"
  git -C "$REPO" config user.name "test"
  echo "x" > "$REPO/f.txt"
  git -C "$REPO" add f.txt
  git -C "$REPO" -c core.hooksPath="$NO_HOOKS" commit -q -m "init"
  mkdir -p "$REPO/.claude" "$REPO/.githooks"
  cp "$REAL_HOOK" "$REPO/.githooks/post-commit"
  chmod +x "$REPO/.githooks/post-commit"   # macOS/Linux 需可执行位, git 才认 hook (Windows 无此位)
}
commit_hooked() { git -C "$REPO" -c core.hooksPath="$REPO/.githooks" commit -q --allow-empty -m "$1"; }
commit_nohook() { git -C "$REPO" -c core.hooksPath="$NO_HOOKS" commit -q --allow-empty -m "$1"; }

echo "── S1. head 匹配 + 新鲜 → pass (不 rm marker) ──"
new_repo r1
HEAD_B=$(git -C "$REPO" rev-parse HEAD)
echo "$HEAD_B|$(date +%s)" > "$REPO/.claude/last-precommit-success"
MARKER_BEFORE=$(cat "$REPO/.claude/last-precommit-success")
commit_hooked m1
# D543: D521/不变量2 hook 层登记（D537 #4 恢复）— pass → bypass.log 新增恰好 1 行 COMMITTED + 影子提交
check "S1a: pass → bypass.log 新增恰好 1 行 (hook 层 COMMITTED 登记)" "1" "$(log_lines "$REPO/.claude/bypass.log")"
check_contains "S1a+: 登记行含 COMMITTED (hook 层)" "$REPO/.claude/bypass.log" "COMMITTED"
if [ -f "$REPO/.claude/last-precommit-success" ]; then
  ok "S1b: pass 后 marker 仍存在 (不 rm)"
else
  fail "S1b: marker 被删除 (旧 rm 行为未修复)"
fi
check "S1c: marker 内容未被 post-commit 改动" "$MARKER_BEFORE" "$(cat "$REPO/.claude/last-precommit-success")"

echo ""
echo "── S2. head 不匹配 → detected-bypass ──"
new_repo r2
echo "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef|$(date +%s)" > "$REPO/.claude/last-precommit-success"
commit_hooked m2
check_contains "S2: head 不匹配 → detected-bypass" "$REPO/.claude/bypass.log" "detected-bypass head-mismatch"

echo ""
echo "── S3. 无 marker → detected-bypass no-precommit-marker ──"
new_repo r3
commit_hooked m3
check_contains "S3: 无 marker → detected-bypass" "$REPO/.claude/bypass.log" "detected-bypass no-precommit-marker"

echo ""
echo "── S4. head 匹配 + 超时 (diff>300s) → possible-bypass ──"
new_repo r4
HEAD_B=$(git -C "$REPO" rev-parse HEAD)
echo "$HEAD_B|$(( $(date +%s) - 600 ))" > "$REPO/.claude/last-precommit-success"
commit_hooked m4
check_contains "S4: 超时 → possible-bypass" "$REPO/.claude/bypass.log" "possible-bypass diff="

echo ""
echo "── S5. legacy 纯时间戳格式 (安装旧 hook 过渡期兼容) ──"
new_repo r5a
echo "$(date +%s)" > "$REPO/.claude/last-precommit-success"
commit_hooked m5a
check "S5a: legacy 新鲜 → pass (不新增)" "0" "$(log_lines "$REPO/.claude/bypass.log")"
new_repo r5b
echo "$(( $(date +%s) - 600 ))" > "$REPO/.claude/last-precommit-success"
commit_hooked m5b
check_contains "S5b: legacy 超时 → possible-bypass" "$REPO/.claude/bypass.log" "possible-bypass diff="

echo ""
echo "── S6. CT-29 交错时序 (dev doc §4 场景 2) ──"
# 时序: A pre-commit 写 marker → A 提交 (post-commit 迟到) → B pre-commit 覆盖 marker
#       → B 提交 (B post-commit 跑完) → A post-commit 迟到执行
# 旧逻辑: B 的 post-commit rm marker → A 迟到判定 → detected-bypass (误判)
# 修复后: 不 rm + head 对账 → A/B 均 pass
new_repo r6
X=$(git -C "$REPO" rev-parse HEAD)
echo "$X|$(date +%s)" > "$REPO/.claude/last-precommit-success"     # A 的 pre-commit
commit_nohook A1                                                 # A 提交, post-commit 推迟
A1=$(git -C "$REPO" rev-parse HEAD)
echo "$A1|$(date +%s)" > "$REPO/.claude/last-precommit-success"   # B 的 pre-commit 覆盖
commit_hooked B1                                                 # B 提交 + post-commit 正常执行
# D543: B pass → hook 层登记 +1 行（同 S1a 新行为）
check "S6a: B 的 post-commit pass (无误判, 登记 1 行)" "1" "$(log_lines "$REPO/.claude/bypass.log")"
(cd "$REPO" && bash "$REAL_HOOK")                                # A 的 post-commit 迟到
check "S6b: A 的迟到 post-commit pass (CT-29 修复, 不误判不 rm)" "1" "$(log_lines "$REPO/.claude/bypass.log")"
if [ -f "$REPO/.claude/last-precommit-success" ]; then
  ok "S6c: marker 未被任何 post-commit 删除"
else
  fail "S6c: marker 被删除 (CT-29 未修复)"
fi
check "S6d: marker 保持 B 的 pre-commit 写入 (head=A1)" "$A1" "$(cut -d'|' -f1 "$REPO/.claude/last-precommit-success")"

echo ""
echo "── S7. D421 amend 三判: marker_head 为被 amend 掉的旧 commit → ② 同父 pass ──"
new_repo r7
X=$(git -C "$REPO" rev-parse HEAD)                       # init
echo "$X|$(date +%s)" > "$REPO/.claude/last-precommit-success"   # A 的 pre-commit 写 marker=X
commit_nohook A1                                          # A 提交 (无 hook), HEAD=A1 (parent X)
A1=$(git -C "$REPO" rev-parse HEAD)
echo "$A1|$(date +%s)" > "$REPO/.claude/last-precommit-success"  # amend 的 pre-commit 写 marker=A1
git -C "$REPO" -c core.hooksPath="$NO_HOOKS" commit -q --amend --allow-empty -m "A-amended"
(cd "$REPO" && bash "$REAL_HOOK")                          # HEAD=A2, HEAD^=X, marker=A1
check "S7: amend → ② 同父 pass (无误报, 登记 1 行)" "1" "$(log_lines "$REPO/.claude/bypass.log")"

echo ""
echo "── S8. D421 并发三判: marker 停在旧祖先 → ③ 祖先 pass ──"
new_repo r8
X=$(git -C "$REPO" rev-parse HEAD)                       # init
commit_nohook A1
commit_nohook B1                                          # HEAD=B1 (parent A1)
echo "$X|$(date +%s)" > "$REPO/.claude/last-precommit-success"   # marker 停在旧 X (X 是 HEAD 祖先)
(cd "$REPO" && bash "$REAL_HOOK")                          # HEAD=B1, HEAD^=A1
check "S8: 并发祖先 → ③ 祖先 pass (无误报, 登记 1 行)" "1" "$(log_lines "$REPO/.claude/bypass.log")"

echo ""
echo "── S9. D421 真绕过: marker 停在旧祖先 + 时间戳过旧 → freshness 抓 possible-bypass ──"
new_repo r9
X=$(git -C "$REPO" rev-parse HEAD)
commit_nohook A1
commit_nohook B1                                          # HEAD=B1
echo "$X|$(( $(date +%s) - 600 ))" > "$REPO/.claude/last-precommit-success"   # stale marker (真 --no-verify)
(cd "$REPO" && bash "$REAL_HOOK")
check_contains "S9: 真绕过 stale marker → possible-bypass" "$REPO/.claude/bypass.log" "possible-bypass diff="

echo ""
echo "── S10. CT-45: merge 提交豁免 — HEAD^2 存在时不写 detected-bypass ──"
new_repo r10
git -C "$REPO" checkout -q -b side
commit_nohook S10side                                          # side 分支提交
git -C "$REPO" checkout -q main
commit_nohook S10main                                          # main 分支提交
git -C "$REPO" merge side --no-edit -q                         # merge 提交 (HEAD^2 存在, 无 pre-commit marker)
if git -C "$REPO" rev-parse HEAD^2 >/dev/null 2>&1; then
  ok "S10a: 成功构造 merge 提交 (HEAD^2 存在)"
else
  fail "S10a: 未能构造 merge 提交"
fi
(cd "$REPO" && bash "$REAL_HOOK")                              # merge 提交 + 无 marker → 应豁免 (CT-45)
check "S10b: merge 提交豁免 (不写 detected-bypass)" "0" "$(log_lines "$REPO/.claude/bypass.log")"

echo ""
echo "结果: 通过 $PASS / 失败 $FAIL"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
