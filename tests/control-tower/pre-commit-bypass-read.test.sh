#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# pre-commit-bypass-read.test.sh — D970（D735 Stage 2）bypass **读面**回归守卫
#
# 背景: Stage 2 把账本移出 git（post-commit 只写 per-session）。若 pre-commit 的读侧不跟上，
#   Gatekeeper（本地硬阻断）与组 7c 绕过审计会**静默变瞎**（铁律 11 违规）。
#   本文件是那次修复的判别性夹具集。
#
# 覆盖矩阵（铁律 48 三路径 + 判别性 + 逐字不变）:
#   ① 逐字不变 — 旧路径单源（沙箱）: NEW 与**改动前脚本**的 [GATEKEEPER] 决策行逐字节一致 + exit 同
#   ② 判别性   — 仅 per-session（无旧路径）: NEW 能看见（熔断）而**改动前脚本看不见** ⇒ 证明修的是真缺陷
#   ③ ACK 放行 — detected-bypass + SYNO_GATEKEEPER_ACK=1 → 告警放行（不再 exit 1）
#   ④ 组 7c    — 3 次 detected-bypass + ACK → 审计段读得到（计数 3）
#   ⑤ 降级     — 解析器（bypass-ledger.sh）缺失 → 回落旧路径 + **显式** degraded 行（不静默）
#   ⑥ 边界     — 合并来源全空 → 显式 degraded 行 + 计数 0（不阻断）
#
# 隔离: 全部夹具在 mktemp 沙箱；读面经沙箱内 `scripts/control-tower/bypass-ledger.sh` +
#   沙箱 `.claude/bypass.log` / `.sessions/` 决定，**绝不触碰真实仓库账本**。
#   高成本夹具（④ 需跑到组 7c）仅 1 个。
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PC="$REPO/scripts/pre-commit-check.sh"
LEDGER="$REPO/scripts/control-tower/bypass-ledger.sh"
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

TODAY="$(date +%Y-%m-%d)"

# 改动前脚本（分支点版本）作为「逐字不变」的对照基线
BASE_SHA="$(git -C "$REPO" merge-base origin/main HEAD 2>/dev/null || echo "")"
OLD_PC="$TMPD/pre-commit-check.old.sh"
if [ -n "$BASE_SHA" ] && git -C "$REPO" show "$BASE_SHA:scripts/pre-commit-check.sh" > "$OLD_PC" 2>/dev/null; then
  ok "对照基线可取（$BASE_SHA:scripts/pre-commit-check.sh）"
else
  no "对照基线不可取（merge-base=${BASE_SHA}）"
  OLD_PC=""
fi
echo "  （对照基线 SHA: ${BASE_SHA:-<无>}）"

# mk_sandbox <detected 行数> <legacy|session|both> <带 ledger 脚本? 1|0>
mk_sandbox() {
  local n="$1" where="$2" withledger="${3:-1}"
  local sb; sb="$(mktemp -d "$TMPD/sb.XXXXXX")"
  git -C "$sb" init -q
  git -C "$sb" config user.email t@t.local; git -C "$sb" config user.name t
  mkdir -p "$sb/.claude" "$sb/.sessions/probe" "$sb/scripts/control-tower" "$sb/docs"
  if [ "$withledger" = "1" ]; then cp "$LEDGER" "$sb/scripts/control-tower/bypass-ledger.sh"; fi
  local i=0 line
  while [ "$i" -lt "$n" ]; do
    line="${TODAY}T00:0${i}:00Z detected-bypass head-mismatch marker=probe${i} parent=probe"
    case "$where" in
      legacy)  printf '%s\n' "$line" >> "$sb/.claude/bypass.log" ;;
      session) printf '%s\n' "$line" >> "$sb/.sessions/probe/bypass.log" ;;
      both)    printf '%s\n' "$line" >> "$sb/.claude/bypass.log"
               printf '%s\n' "$line" >> "$sb/.sessions/probe/bypass.log" ;;
    esac
    i=$((i+1))
  done
  printf 'seed\n' > "$sb/docs/seed.md"
  echo "$sb"
}

# run_gate <脚本> <沙箱> [额外 env...] → 输出到 $TMPD/out.log，echo 退出码
run_gate() {
  local script="$1" sb="$2"; shift 2
  ( cd "$sb" && env "$@" bash "$script" > "$TMPD/out.log" 2>&1 )
  echo $?
}

echo ""
echo "── ① 逐字不变: 旧路径单源（沙箱）→ 与改动前脚本决策逐字一致 ──"
SB="$(mk_sandbox 1 legacy 1)"
RC_NEW="$(run_gate "$PC" "$SB")"
NEW_LINES="$(grep -a '\[GATEKEEPER\]' "$TMPD/out.log" | sed 's/[[:space:]]*$//' || true)"
cp "$TMPD/out.log" "$TMPD/out.new.log"
if [ -n "$OLD_PC" ]; then
  RC_OLD="$(run_gate "$OLD_PC" "$SB")"
  OLD_LINES="$(grep -a '\[GATEKEEPER\]' "$TMPD/out.log" | sed 's/[[:space:]]*$//' || true)"
  if [ "$NEW_LINES" = "$OLD_LINES" ] && [ "$RC_NEW" = "$RC_OLD" ]; then
    ok "① 决策行逐字节一致且 exit 同（NEW exit=${RC_NEW} / OLD exit=${RC_OLD}）"
  else
    no "① 与旧版不一致: NEW exit=${RC_NEW} / OLD exit=${RC_OLD}；NEW=[${NEW_LINES}] OLD=[${OLD_LINES}]"
  fi
else
  no "① 无对照基线，跳过（不计通过）"
fi
[ "$RC_NEW" -eq 1 ] && ok "① 旧路径单源 1 条 → 熔断 exit 1（语义未变）" || no "① 应 exit 1，实为 ${RC_NEW}"

echo ""
echo "── ② 判别性: 仅 per-session（旧路径不存在）──"
SB="$(mk_sandbox 1 session 1)"
RC_NEW="$(run_gate "$PC" "$SB")"
grep -aq '检测到今日 1 次' "$TMPD/out.log" && ok "② NEW 看得见 per-session 记录（熔断）" || no "② NEW 仍看不见（回归）"
[ "$RC_NEW" -eq 1 ] && ok "② NEW exit 1" || no "② NEW 应 exit 1，实为 ${RC_NEW}"
if [ -n "$OLD_PC" ]; then
  RC_OLD="$(run_gate "$OLD_PC" "$SB")"
  if grep -aq '\[GATEKEEPER\]' "$TMPD/out.log"; then
    no "② 改动前脚本竟也看得见（夹具无效，无法归因）"
  else
    ok "② 改动前脚本看不见（exit=${RC_OLD}，无 GATEKEEPER 行）⇒ 修的确实是真缺陷"
  fi
fi

echo ""
echo "── ③ ACK 放行: detected-bypass + SYNO_GATEKEEPER_ACK=1 ──"
SB="$(mk_sandbox 1 session 1)"
printf 'doc\n' > "$SB/docs/d.md"; git -C "$SB" add docs/d.md
RC_NEW="$(run_gate "$PC" "$SB" SYNO_GATEKEEPER_ACK=1)"
grep -aq '已人工确认 (SYNO_GATEKEEPER_ACK=1)' "$TMPD/out.log" && ok "③ ACK 生效（告警放行，不再 exit 1）" || no "③ ACK 未生效"
# 断言 Gatekeeper 的**决策**（不阻断），而非整脚本 exit（沙箱缺 CI 侧脚本，exit 另有来源）
if grep -aq '\[GATEKEEPER\] 请使用:' "$TMPD/out.log"; then
  no "③ 仍被 Gatekeeper 阻断（ACK 未放行）"
else
  ok "③ Gatekeeper 未阻断（ACK 放行生效；该夹具整脚本 exit=${RC_NEW} 另有来源）"
fi

echo ""
echo "── ④ 组 7c 绕过审计: 3 次 detected-bypass + ACK（唯一高成本夹具）──"
SB="$(mk_sandbox 3 session 1)"
printf 'export const a = 1;\n' > "$SB/src.ts"; git -C "$SB" add src.ts
RC_NEW="$(run_gate "$PC" "$SB" SYNO_GATEKEEPER_ACK=1)"
if grep -aq '绕过审计: 24h 内 --no-verify 3 次' "$TMPD/out.log"; then
  ok "④ 组 7c 读到合并来源（计数 3）"
else
  no "④ 组 7c 读不到（计数应为 3）：$(grep -a '绕过审计' "$TMPD/out.log" | head -1)"
fi
echo "     （该夹具 exit=${RC_NEW}，非断言项——沙箱缺真实仓库脚本）

── ⑤ 降级: 解析器缺失 → 回落旧路径 + 显式 degraded（不静默）──"
SB="$(mk_sandbox 1 legacy 0)"
RC_NEW="$(run_gate "$PC" "$SB")"
grep -aq 'bypass-ledger.sh 缺失 — 回落旧路径单源 \[degraded\]' "$TMPD/out.log" \
  && ok "⑤ 解析器缺失 → 显式 degraded 行" || no "⑤ 缺显式 degraded 行（静默）"
grep -aq '检测到今日 1 次' "$TMPD/out.log" && ok "⑤ 回落旧路径后仍能看见（行为与出库前一致）" || no "⑤ 回落失败"
[ "$RC_NEW" -eq 1 ] && ok "⑤ 熔断仍生效（exit 1）" || no "⑤ 应 exit 1，实为 ${RC_NEW}"

echo ""
echo "── ⑥ 边界: 合并来源全空 → 显式 degraded + 计数 0（不阻断）──"
SB="$(mk_sandbox 0 session 1)"
printf 'doc\n' > "$SB/docs/d.md"; git -C "$SB" add docs/d.md
RC_NEW="$(run_gate "$PC" "$SB")"
grep -aq '账本合并来源为空' "$TMPD/out.log" && ok "⑥ 全空 → 显式 degraded 行（不静默）" || no "⑥ 缺显式 degraded 行"
if grep -aq '\[GATEKEEPER\]' "$TMPD/out.log"; then no "⑥ 无记录却触发 Gatekeeper"; else ok "⑥ 计数 0 → 不误报（无 GATEKEEPER 行）"; fi

echo ""
echo "  结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
