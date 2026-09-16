#!/usr/bin/env bash
# tests/control-tower/synova-commit.test.sh — synova-commit 配对测试（U7/CT-40 配对规则）
# D525: 断言对齐 D508 后现行为——D507 内联并行门禁段已移除，隔离职责由
#   ① D311 staging_guard（他人活跃写集 → 硬阻断；guard 崩溃 → 显式降级）
#   ② task-start.sh 开工拦截（D515 项1，另有 task-start-parallel.test.sh 覆盖）
#   本测试聚焦 ①；②不重复覆盖。
# 覆盖（铁律 48 三路径 + 接线）:
#   ① 接线: staging_guard 调用段存在（--session-id/--staged）
#   ② 行为(拦): 他人活跃写集文件被暂存 → synova-commit exit 1 + 点名文件与归属
#   ③ 行为(放): 自己登记的写集文件 → 不拦（提交继续，degraded pre-commit 下 commit 完成）
#   ④ 降级: guard 执行异常路径有显式提示（非静默 fail-open 无痕）
#   ⑤ 判定语义: guard status JSON 解析（block/ok/坏输入）
#   ── D706（本节新增）── 部分提交丢弃删除项
#   ⑥ 跨调用: 门禁拒绝后暂存态仍在 → 第二次提交必须真的把删除项写进树
#      （原缺陷: git commit -- <pathspec> 对「索引已删除 + .gitignore 命中 + 磁盘仍存在」
#        的路径做内部 add 时因 ignored 跳过 → 删除不进提交却 exit 0 → 暂存态被静默销毁）
#   ⑦ 不变量: staged ⊄ --files 声明 → fail-closed 点名（D329 防洗白语义）
#   ⑧ 负例: 真错配（git hook 篡改索引）→ 阻断 + 撤销提交 + 还原暂存区
# 沙箱: mktemp 仓库 + 复制 scripts/ + SYNO_CT_DIR 隔离 registry + SYNO_PRE_COMMIT stub
# M13/D521: unset GIT_DIR/GIT_WORK_TREE + git -c 一次性身份（禁 git config 持久写）
set -uo pipefail
unset GIT_DIR GIT_WORK_TREE
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SC="$HERE/../../scripts/control-tower/synova-commit"
PASS=0; FAIL=0
ok()  { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT

# ① 接线: staging_guard 段存在（D508 后并行隔离的实际承载者）
grep -q 'STAGING_GUARD="\$PROJECT_ROOT/scripts/control-tower/staging_guard.py"' "$SC" \
  && grep -q -- '--session-id "$SESSION_ID" --staged' "$SC" \
  && ok "① staging_guard 接线存在（D311 段）" || bad "① staging_guard 接线缺失"
grep -q "暂存区隔离 (D311 M1b)" "$SC" && ok "① 阻断点名文案存在" || bad "① 阻断文案缺失"
grep -q "降级放行，请检查其日志" "$SC" && ok "④ guard 崩溃显式降级提示（非静默）" || bad "④ 降级静默"

# ── 沙箱: 复制 scripts（REPO_ROOT=沙箱 → registry/guard/bypass.log 全落沙箱内）──
# 注意: staging_guard 从脚本位置解析 registry（不吃 SYNO_CT_DIR）——隔离靠整目录复制而非 env
SB="$TMPD/sb"; mkdir -p "$SB/.claude" "$SB/.codex/control-tower"
cp -R "$HERE/../../scripts" "$SB/scripts"
git -C "$SB" init -q
# 沙箱仓库本地身份（post-commit-marker.test.sh 同款先例）——CI runner 无全局 git 身份，
# synova-commit 内部 git commit + hook 影子提交都需要；写入的是沙箱自身 config，非宿主（M13 语义）
git -C "$SB" config user.email "test@test.local"
git -C "$SB" config user.name "test"
touch "$SB/.claude/bypass.log"
STUB="$TMPD/stub-precommit.sh"; printf '#!/bin/bash\nexit 0\n' > "$STUB"; chmod +x "$STUB"

# 他人 session 登记写集 x.md
python3 "$SB/scripts/control-tower/session_registry.py" register --session-id other-sess --brief "" --task-id D999 >/dev/null 2>&1
python3 "$SB/scripts/control-tower/session_registry.py" write-set --session-id other-sess --add x.md >/dev/null 2>&1

# ② 行为(拦): 他人写集文件 → exit 1 + 点名
echo "foreign" > "$SB/x.md"
git -C "$SB" -c user.name=t -c user.email=t@t add x.md
OUT=$(cd "$SB" && SYNO_PRE_COMMIT="$STUB" SYNO_GATEKEEPER_ACK=1 \
  bash "$SB/scripts/control-tower/synova-commit" --task-id T-self --agent test --message "test: foreign file" 2>&1); rc=$?
[ "$rc" -eq 1 ] && ok "② 他人写集 → exit 1（并行劫持阻断）" || bad "② 应拦, 实际 exit=$rc"
echo "$OUT" | grep -q "x.md" && echo "$OUT" | grep -q "other-sess" \
  && ok "② 点名文件与归属 session" || bad "② 未点名: $(echo "$OUT" | grep -a '❌' | head -2)"

# 清理 ② 的暂存（场景隔离——否则 x.md 仍会被 guard 拦，属正确行为但非本场景语义）
git -C "$SB" -c user.name=t -c user.email=t@t restore --staged x.md 2>/dev/null || git -C "$SB" rm -q --cached x.md 2>/dev/null || true
rm -f "$SB/x.md"

# ③ 行为(放): 自己登记的写集 → 不拦（degraded pre-commit 下 commit 完成）
python3 "$SB/scripts/control-tower/session_registry.py" register --session-id T-self --brief "" --task-id T-self >/dev/null 2>&1
python3 "$SB/scripts/control-tower/session_registry.py" write-set --session-id T-self --add y.md >/dev/null 2>&1
echo "own" > "$SB/y.md"
git -C "$SB" -c user.name=t -c user.email=t@t add y.md
OUT2=$(cd "$SB" && SYNO_PRE_COMMIT="$TMPD/missing-precommit" \
  bash "$SB/scripts/control-tower/synova-commit" --task-id T-self --agent test --message "test: own file" 2>&1); rc2=$?
if echo "$OUT2" | grep -q "暂存区隔离"; then
  bad "③ 自己写集被误拦"
else
  ok "③ 自己写集不拦（guard 放行）"
fi
git -C "$SB" log --oneline 2>/dev/null | grep -q "test: own file" \
  && ok "③ commit 实际完成（链路走通）" || bad "③ commit 未落: rc=$rc2 :: $(echo "$OUT2" | tail -2)"

# ⑤ 判定语义: guard status JSON 解析（block/degraded 兜底——与 synova-commit 内联判定同语义）
python3 - <<'PY' && ok "⑤ status JSON 判定语义（block/ok/坏输入）" || bad "⑤ 判定语义错误"
import json, sys
def status(payload):
    try:
        return json.loads(payload).get("status", "degraded")
    except Exception:
        return "degraded"
assert status('{"status":"block","foreign_files":[]}') == "block"
assert status('{"status":"ok"}') == "ok"
assert status('NOT JSON') == "degraded"
assert status('{}') == "degraded"
sys.exit(0)
PY

# ═══ D706: 部分提交丢弃删除项（⑥⑦⑧）═══
# 独立沙箱（需要 .gitignore + git rm --cached 的特定地形，不复用上面的 SB）
SB7="$TMPD/d706"; mkdir -p "$SB7/.claude" "$SB7/.codex/control-tower"
cp -R "$HERE/../../scripts" "$SB7/scripts"
git -C "$SB7" init -q
git -C "$SB7" config user.email "test@test.local"; git -C "$SB7" config user.name "test"
touch "$SB7/.claude/bypass.log"
D706_RUN() { (cd "$SB7" && SYNO_PRE_COMMIT="$STUB" bash "$SB7/scripts/control-tower/synova-commit" "$@" 2>&1); }

# 地形: vendor/ 被 .gitignore 命中，vendor/widget.txt 曾入库（模拟 D665 的 gitlink 摘除）
printf 'vendor/\n' > "$SB7/.gitignore"; mkdir -p "$SB7/vendor"
printf 'payload\n' > "$SB7/vendor/widget.txt"; printf 'v1\n' > "$SB7/normal.txt"
git -C "$SB7" add -f .gitignore normal.txt vendor/widget.txt
git -C "$SB7" commit -q -m "init: 基线"

# ⑥ 跨调用: 先被门禁拒（pre-commit stub exit 1）→ 暂存态必须仍在 → 再提交必须真摘除
git -C "$SB7" rm -q --cached vendor/widget.txt
printf 'v2\n' > "$SB7/normal.txt"; git -C "$SB7" add normal.txt
DENY="$TMPD/deny.sh"; printf '#!/bin/bash\nexit 1\n' > "$DENY"
(cd "$SB7" && SYNO_PRE_COMMIT="$DENY" bash "$SB7/scripts/control-tower/synova-commit" \
   --task-id T706 --agent test --message "chore(D706): 应被拒" >/dev/null 2>&1) || true
git -C "$SB7" diff --cached --name-only HEAD 2>/dev/null | grep -qx 'vendor/widget.txt' \
  && ok "⑥ 门禁拒绝后暂存态未丢失（跨调用前提）" || bad "⑥ 拒绝路径吞掉了暂存态"

STILL_BEFORE=$(git -C "$SB7" ls-tree -r HEAD --name-only 2>/dev/null | grep -c 'vendor/widget.txt' || true)
D706_RUN --task-id T706 --agent test --message "chore(D706): 摘除 vendor/widget.txt" >/dev/null 2>&1 || true
STILL_AFTER=$(git -C "$SB7" ls-tree -r HEAD --name-only 2>/dev/null | grep -c 'vendor/widget.txt' || true)
[ "$STILL_BEFORE" -eq 1 ] && [ "$STILL_AFTER" -eq 0 ] \
  && ok "⑥ 删除项真的进了提交树（ls-tree 1→0；原缺陷为 1→1 静默丢删除）" \
  || bad "⑥ D706 未修: 提交前=$STILL_BEFORE 提交后=$STILL_AFTER（期望 1→0）"
# 精确断言: 目标提交必须以**删除态(D)**记录该路径
# （弱断言「树里出现过该路径」会命中 init 提交 → 假绿，故限定 diff-filter=D + 指定提交）
_D706C=$(git -C "$SB7" log --format=%H -1 --grep="摘除 vendor/widget.txt" 2>/dev/null)
if [ -n "$_D706C" ] \
   && git -C "$SB7" show --diff-filter=D --name-only --format="" "$_D706C" 2>/dev/null | grep -qx 'vendor/widget.txt'; then
  ok "⑥ 目标提交以删除态(D)记录 vendor/widget.txt"
else
  bad "⑥ 目标提交未以 D 记录该路径（ref='${_D706C:-none}'）"
fi
# ⑦ 不变量: staged ⊄ --files 声明 → fail-closed 点名（防 D329「--files 洗白他人暂存」）
printf 'extra\n' > "$SB7/extra.txt"; git -C "$SB7" add extra.txt
OUT7=$(D706_RUN --task-id T706 --agent test --message "chore(D706): 越界" --files normal.txt); rc7=$?
[ "$rc7" -eq 1 ] && ok "⑦ staged 越界 → exit 1（fail-closed）" || bad "⑦ 越界未拦 rc=$rc7"
echo "$OUT7" | grep -q "extra.txt" && echo "$OUT7" | grep -q "声明之外的变更" \
  && ok "⑦ 点名越界文件 + 专用文案" || bad "⑦ 未点名: $(echo "$OUT7" | grep -a '❌' | head -1)"
git -C "$SB7" restore --staged extra.txt 2>/dev/null || true; rm -f "$SB7/extra.txt"

# ⑧ 负例: 真错配（git pre-commit hook 在提交瞬间篡改索引）→ 阻断 + 撤销提交 + 还原暂存区
printf 'v3\n' > "$SB7/normal.txt"; git -C "$SB7" add normal.txt
mkdir -p "$SB7/.git/hooks"
printf '#!/bin/bash\ngit restore --staged normal.txt 2>/dev/null\nexit 0\n' > "$SB7/.git/hooks/pre-commit"
chmod +x "$SB7/.git/hooks/pre-commit"
H8=$(git -C "$SB7" rev-parse HEAD 2>/dev/null)
IDX8=$(git -C "$SB7" diff --cached --name-only HEAD 2>/dev/null | tr '\n' ' ')
OUT8=$(D706_RUN --task-id T706 --agent test --message "chore(D706): 错配负例"); rc8=$?
H8B=$(git -C "$SB7" rev-parse HEAD 2>/dev/null)
IDX8B=$(git -C "$SB7" diff --cached --name-only HEAD 2>/dev/null | tr '\n' ' ')
[ "$rc8" -eq 1 ] && ok "⑧ 真错配 → exit 1（不变量探测器生效）" || bad "⑧ 错配未拦 rc=$rc8"
echo "$OUT8" | grep -q "提交树与暂存声明不一致" && ok "⑧ 点名不一致" || bad "⑧ 无错配文案"
[ "$H8" = "$H8B" ] && ok "⑧ 假阻断防止: 提交已撤销（HEAD 未前移）" || bad "⑧ 提交仍留在历史"
[ "$IDX8" = "$IDX8B" ] && ok "⑧ 暂存区已还原（暂存态未丢）" || bad "⑧ 索引未还原: '$IDX8' → '$IDX8B'"

echo "pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]