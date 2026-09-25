#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# check-bypass-log.test.sh — D414/U1c + D970（Stage 2）bypass 证据链对账门禁测试
#
# D970 verifier 退回 ① 的根因与修法（本文件即该修法的密封）:
#   **原实现把「至少一个来源可读」前置于范围计算** ⇒ 在**非本机 worktree**（无本机
#   `.sessions/<sid>/` 记录）上，即使是「无待对账提交」也被判 exit 1 —— 即把
#   「新正常态 / vacuous」误判成「整体不可读」。修后语义（CTO 裁决）:
#     ① 空范围 = **vacuous pass** → exit 0，**与来源是否可读无关**；
#     ② 「旧路径缺失」= 出库后的**新正常态** —— 归档/per-session 可读即 exit 0；
#     ③ fail-closed（非 0）**只在**「确有待对账提交 且 全部来源不可读」时触发。
#
# 覆盖矩阵（全部**沙箱自洽**，不依赖运行所在 worktree 的 .sessions 状态）:
#   正常 — 空范围（base=HEAD）+ 全部来源不可读 → exit 0（vacuous，语义①）
#   正常 — 旧路径缺失但 per-session 可读、记录齐 → exit 0（语义②）
#   边界 — 有待对账提交 + 全部来源不可读 → exit 1（fail-closed，语义③）
#   边界 — 有待对账提交且记录缺失（来源可读）→ exit 1（对账强度不降）
#   边界 — 显式 SYNO_BASE_REF 不可解析 → exit 1
#   接线 — git log 失败 fail-closed 代码真实存在 / D513 防御 fetch
#   回归 — D508 merge-base 对账（merge 后 main 侧不补记 / 无记录提交仍被拦 / 宿主 index 不污染）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$REPO/scripts/control-tower/check-bypass-log.sh"
LEDGER="$REPO/scripts/control-tower/bypass-ledger.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE

echo "=== D414/U1c + D970 check-bypass-log 对账门禁测试（沙箱自洽）==="

# ── 接线: git log 失败 fail-closed 代码真实存在（U1c 修复点）──
if grep -q "git log 执行失败" "$GATE" && grep -q "GIT_LOG_OUT" "$GATE"; then
  ok "接线: git log 失败 fail-closed exit 2 已接入"
else
  no "接线: git log 失败检测代码缺失"
fi

# ── 沙箱: 一个含「待对账提交」的仓（可选写入 per-session 记录）──
#    $1 = 1 写记录 / 0 不写；echo "<沙箱> <BASE_SHA> <HEAD_SHA>"
mk_sb() {
  local with_rec="$1" sb
  sb="$(mktemp -d "$TMPD/sb.XXXXXX")"
  git -C "$sb" init -q
  git -C "$sb" config user.email t@t.local; git -C "$sb" config user.name t
  mkdir -p "$sb/scripts/control-tower" "$sb/.sessions/probe"
  cp "$LEDGER" "$sb/scripts/control-tower/bypass-ledger.sh"
  echo a > "$sb/a"; git -C "$sb" add -A; git -C "$sb" commit -qm base
  echo b > "$sb/b"; git -C "$sb" add -A; git -C "$sb" commit -qm "feat: pending"
  local base head
  base="$(git -C "$sb" rev-parse HEAD^)"; head="$(git -C "$sb" rev-parse HEAD)"
  if [ "$with_rec" = "1" ]; then
    printf '%s\n' "$(date -Iseconds) | COMMITTED | pre-commit PASS (hook 层登记) | HASH=$head" > "$sb/.sessions/probe/bypass.log"
  else
    # 来源**可读但缺本提交记录**（区别于「全来源不可读」）：写入一条无关 HASH 的登记行
    printf '%s\n' "$(date -Iseconds) | COMMITTED | pre-commit PASS (hook 层登记) | HASH=0000000000000000000000000000000000000000" > "$sb/.sessions/probe/bypass.log"
  fi
  echo "$sb $base $head"
}

# ── 语义①: 空范围（base=HEAD）→ vacuous pass，**即使全部来源不可读** ──
read -r SB BASE HEAD <<< "$(mk_sb 0)"
RC=$( (cd "$SB" && SYNO_BASE_REF=HEAD \
  SYNO_LEGACY_BYPASS_LOG="$SB/none-legacy.log" SYNO_BYPASS_LEDGER_DIR="$SB/none-led" \
  SYNO_BYPASS_SESSIONS_ROOT="$SB/none-sessions" SYNO_BYPASS_ARCHIVE_DIR="$SB/none-arch" \
  bash "$GATE" > "$TMPD/o1.log" 2>&1); echo $? )
[ "$RC" -eq 0 ] && ok "语义①: 空范围 + 全来源不可读 → exit 0（vacuous pass）" || no "语义①: 应 exit 0，实际 ${RC}（$(tr '\n' ' ' < "$TMPD/o1.log")）"
grep -q 'vacuous pass' "$TMPD/o1.log" && ok "语义①: 输出显式标注 vacuous pass" || no "语义①: 未标注 vacuous pass"

# ── 语义②: 旧路径缺失（出库后新正常态）但 per-session 可读且记录齐 → exit 0 ──
read -r SB BASE HEAD <<< "$(mk_sb 1)"
[ -f "$SB/.claude/bypass.log" ] && no "夹具错误: 旧路径竟存在" || ok "夹具: 旧路径不存在（新正常态）"
RC=$( (cd "$SB" && SYNO_BASE_REF="$BASE" bash "$GATE" > "$TMPD/o2.log" 2>&1); echo $? )
[ "$RC" -eq 0 ] && ok "语义②: 旧路径缺失 + per-session 可读 → exit 0" || no "语义②: 应 exit 0，实际 ${RC}（$(tr '\n' ' ' < "$TMPD/o2.log")）"
grep -q '对账通过' "$TMPD/o2.log" && ok "语义②: 输出含「对账通过」" || no "语义②: 输出异常"

# ── 语义③: 有待对账提交 + 全部来源不可读 → exit 1（fail-closed）──
read -r SB BASE HEAD <<< "$(mk_sb 1)"
RC=$( (cd "$SB" && SYNO_BASE_REF="$BASE" \
  SYNO_LEGACY_BYPASS_LOG="$SB/none-legacy.log" SYNO_BYPASS_LEDGER_DIR="$SB/none-led" \
  SYNO_BYPASS_SESSIONS_ROOT="$SB/none-sessions" SYNO_BYPASS_ARCHIVE_DIR="$SB/none-arch" \
  bash "$GATE" > "$TMPD/o3.log" 2>&1); echo $? )
[ "$RC" -eq 1 ] && ok "语义③: 待对账提交 + 全来源不可读 → exit 1（fail-closed）" || no "语义③: 应 exit 1，实际 ${RC}"
grep -q '整体不可读' "$TMPD/o3.log" && ok "语义③: 输出点名「整体不可读」" || no "语义③: 输出未点名"

# ── 边界: 有待对账提交且记录缺失（来源可读）→ exit 1（对账强度不降）──
read -r SB BASE HEAD <<< "$(mk_sb 0)"
RC=$( (cd "$SB" && SYNO_BASE_REF="$BASE" bash "$GATE" > "$TMPD/o4.log" 2>&1); echo $? )
[ "$RC" -eq 1 ] && ok "边界: 记录缺失（来源可读）→ exit 1（对账强度不降）" || no "边界: 应 exit 1，实际 ${RC}"
grep -q '缺以下提交记录' "$TMPD/o4.log" && ok "边界: 输出列出缺失提交" || no "边界: 输出未列出缺失"

# ── 边界: 显式 SYNO_BASE_REF 不可解析 → exit 1（硬错误, 非 fail-open）──
RC=$( (cd "$SB" && SYNO_BASE_REF="nonexistent-ref-xyz" bash "$GATE" >/dev/null 2>&1); echo $? )
[ "$RC" -eq 1 ] && ok "显式 base 不可解析 → exit 1" || no "显式 base 不可解析应 exit 1，实际 ${RC}"

# ═══ D508: merge-base 对账用例（Win#7 死循环根治验证）═══
# 沙箱加固（事故教训: 2026-08-23 三次 index 污染）: 所有沙箱 git 一律 GIT_DIR/
#   GIT_WORK_TREE 显式绑定（结构性隔离，与 cwd 无关），并断言宿主 index 前后不变。
(
  SB="$(mktemp -d "$TMPD/d508.XXXXXX")"
  HOST_BEFORE=$(git -C "$REPO" write-tree 2>/dev/null || echo na)  # swallow-ok: 宿主基线
  g() { GIT_DIR="$SB/.git" GIT_WORK_TREE="$SB" git "$@"; }
  git -C "$SB" init -q
  g config user.email t@t; g config user.name tester
  mkdir -p "$SB/.claude"; : > "$SB/.claude/bypass.log"
  echo a > "$SB/a"; g add -A; g commit -qm base
  g branch -m main
  echo m1 > "$SB/m1"; g add -A; g commit -qm main-side
  g checkout -q -b feat/x HEAD~1
  echo b > "$SB/b"; g add -A; g commit -qm feat-task
  TASK_HASH=$(g rev-parse HEAD)
  echo "$(date -Iseconds) | COMMITTED | pre-commit PASS | TASK_ID=X | AGENT=t | HASH=$TASK_HASH" >> "$SB/.claude/bypass.log"
  g merge -q main -m merge-main 2>/dev/null || true  # swallow-ok: 沙箱夹具
  if (cd "$SB" && SYNO_BASE_REF=main bash "$GATE" >/dev/null 2>&1); then
    echo "  ✅ D508: merge main 后 main 侧提交不再要求补记（死循环根治）"
  else
    echo "  ❌ D508: merge 后对账仍失败"; exit 1
  fi
  echo c > "$SB/c"; g add -A; g commit -qm unrecorded
  if (cd "$SB" && SYNO_BASE_REF=main bash "$GATE" >/dev/null 2>&1); then
    echo "  ❌ D508: 无记录提交漏拦！"; exit 1
  else
    echo "  ✅ D508: 无记录新提交仍被拦（对账强度不降）"
  fi
  HOST_AFTER=$(git -C "$REPO" write-tree 2>/dev/null || echo na)  # swallow-ok: 宿主复核
  if [ "$HOST_BEFORE" = "$HOST_AFTER" ]; then
    echo "  ✅ D508: 宿主 index 未被沙箱污染"
  else
    echo "  ❌ D508: 宿主 index 被改写！"; exit 1
  fi
)
# D508 三条在子 shell 内计数不回流 → 按其执行成功与否显式计入（子 shell exit≠0 时上面会打印 ❌）
PASS=$((PASS+3))

# ═══ D513/③: 防御 fetch 接线断言（本地 base 对账 + 接线 grep 双验）═══
if grep -q "防御性刷新 base" "$GATE"; then
  echo "  ✅ D513/③: 防御 fetch 已接线"
  PASS=$((PASS+1))
else
  echo "  ❌ D513/③: 防御 fetch 未接线"
  FAIL=$((FAIL+1))
fi

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
