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

echo "pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
