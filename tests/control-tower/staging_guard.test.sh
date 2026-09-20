#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# staging-guard-release.test.sh — D839 认领制根治（完成即释放 / 批量扫描 / 释放持久化）
#
# 背景: 认领制的候选池只看 brief 里 Q2 的字面路径，不看该 brief 所属任务是否已完成
#   → 任何历史 brief 提及过的文件对后续所有任务永久锁死（D838 被已完成的 D806 brief 阻断）。
#   本测试锁死修复后的三条行为，含「反向不放松」与「持久化不复活」。
#
# 覆盖矩阵（铁律 48：正常 / 降级 / 边界）:
#   场景 A（放行 · 正常路径）: 任务 A 已完成（task-state=impl_done）声明文件 X，新任务 B 改 X
#       → 修复前: staging_guard status=block / exit 1（先红）
#       → 修复后: status=warn / exit 0 + 释放理由（后绿，可提交）
#   场景 B（反向 · 边界）: 任务 A 仍在进行（task-state=claimed）→ B 改 X **仍必须 block**
#       （释放机制不得放松真实并发保护）
#   场景 C（持久化 · 正常路径）: 显式释放 + task-state status 漂移回 claimed + brief 文本改回
#       ASCII + declare-write-set.sh 重跑 → 认领**不复活**（D806 一次性改文本法的脆弱点封死）
#   场景 D（降级 · fail-closed）: 任务 A 无 task-state 卡 → 拿不到"已完成"证据 → **不释放**，仍 block
#   场景 E（批量）: scan 列出全部失效认领 / release-stale 批量释放后 released 全为 true
#
# 隔离: mktemp -d 临时 git repo + 复制真实脚本（staging_guard / resolver / claim_release /
#   session_registry / brief_parser / declare-write-set）→ 零真实仓库写入、零网络。
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
# ⚠ 沙箱铁律: 一律跑**沙箱内副本**（下面 GUARD/CLAIM 指向 ${SB}），绝不跑真实仓库路径。
#   真实路径会让 REPO_ROOT=真实仓库 → 测试直接写真实仓库的 task-state。
#   D839 自测期实测踩过：曾把 167 条批量释放写进工作树 task-state/claim-releases.json。
#   末尾「不越界写入」断言把这条钉死。
TODAY=$(date +%Y-%m-%d)
# 沙箱围栏基准: 记录真实仓库释放台账的指纹（存在也要比对内容——测试期间不得改动它）
REAL_LEDGER="$REPO_DIR/task-state/claim-releases.json"
if [ -f "$REAL_LEDGER" ]; then REAL_LEDGER_SIG=$(shasum -a 256 "$REAL_LEDGER" | cut -d' ' -f1); else REAL_LEDGER_SIG="ABSENT"; fi

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_eq() { if [ "$1" = "$2" ]; then pass "$3 (=$1)"; else fail "$3 — 实际 $1 期望 $2"; fi; }
assert_contains() { if echo "$1" | grep -qF -- "$2"; then pass "$3"; else fail "$3 — 未找到: $2"; fi; }
assert_not_contains() { if echo "$1" | grep -qF -- "$2"; then fail "$3 — 不应包含: $2"; else pass "$3"; fi; }
scen_start() { SCEN_BASE=$FAIL; }
scen_end() { if [ "$FAIL" -eq "$SCEN_BASE" ]; then eval "$1=PASS"; else eval "$1=FAIL"; fi; }

# ── 沙箱: 真实脚本 + 最小仓库结构 ──
SB=$(mktemp -d); trap 'rm -rf "$SB"' EXIT
git -C "$SB" init -q
git -C "$SB" config user.email t@t.local
git -C "$SB" config user.name t
mkdir -p "$SB/.claude/task-briefs" "$SB/task-state" "$SB/scripts/control-tower" "$SB/scripts/workflow" "$SB/docs"
for f in staging_guard.py session_registry.py brief_parser.py write_lock.py declare-write-set.sh; do
  if [ -f "$REPO_DIR/scripts/control-tower/$f" ]; then
    cp "$REPO_DIR/scripts/control-tower/$f" "$SB/scripts/control-tower/$f"
  else
    echo "❌ 缺源文件 scripts/control-tower/$f" >&2; exit 2
  fi
done
# claim_release.py 是本卡新增件：缺失时**不提前退出** —— 否则修复前跑不出场景 A/B/D 的真实红
# （门禁前置就 exit 2，失去"先红"证据）。缺失交由场景 C/E 各自报 FAIL。
if [ -f "$REPO_DIR/scripts/control-tower/claim_release.py" ]; then
  cp "$REPO_DIR/scripts/control-tower/claim_release.py" "$SB/scripts/control-tower/claim_release.py"
fi
cp "$REPO_DIR/scripts/workflow/resolve-commit-brief.sh" "$SB/scripts/workflow/resolve-commit-brief.sh"
# D839: 沙箱内副本 —— staging_guard 的 REPO_ROOT = 本文件 parents[2] = $SB
GUARD="$SB/scripts/control-tower/staging_guard.py"
CLAIM="$SB/scripts/control-tower/claim_release.py"
printf 'x\n' > "$SB/docs/x.md"
git -C "$SB" add -A >/dev/null 2>&1
git -C "$SB" commit -qm "init" >/dev/null 2>&1

mk_brief() { # <D#> <slug> <path-in-q2>
  cat > "$SB/.claude/task-briefs/${TODAY}-${1}-${2}.md" <<EOF
# Task Brief: ${1}
#CRITERIA: A

## Q0: 定位 — 夹具

## Q1: 调研 — 夹具

## Q2: 范围 — 夹具
做什么：
- ${3}

不做什么：
- 不改 docs/x.md.bak

## Q3: 验收 — 夹具

## 架构层: 基础设施
## Done 标准
- [ ] 夹具
EOF
}
mk_state() { # <D#> <status|NONE>
  if [ "$2" = "NONE" ]; then rm -f "$SB/task-state/$1.json"; return; fi
  printf '{"task_id":"%s","title":"夹具","status":"%s"}\n' "$1" "$2" > "$SB/task-state/$1.json"
}
run_guard() { # <session-id> → OUT / EC
  OUT=$(cd "$SB" && python3 "$GUARD" --session-id "$1" --staged docs/x.md 2>&1); EC=$?
}

scen_start
echo "── 场景 A: 已完成任务 A 声明 X + 新任务 B 改 X → 修复后应放行(warn) ──"
rm -f "$SB"/.claude/task-briefs/*.md
mk_brief D901 a "docs/x.md"
mk_brief D902 b "docs/x.md"
mk_state D901 impl_done
mk_state D902 claimed
run_guard D902
assert_eq "$EC" "0" "场景A exit 0（不再硬阻断）"
assert_contains "$OUT" '"status": "warn"' "场景A status=warn（降级为警告）"
assert_contains "$OUT" "D901" "场景A 释放理由点名被释放的任务 D901"
assert_contains "$OUT" "impl_done" "场景A 释放依据=task-state 状态 impl_done"
assert_not_contains "$OUT" '"status": "block"' "场景A 不得 block"
# 源头修复直测（resolver 有 6 个生产消费者：G12 范围 / commit-msg / verifiable-done /
# plan-integrity / brief-vs-code / staging_guard —— 任一拿到已完成任务的 brief 都按错任务校验）
RES_OUT=$(cd "$SB" && bash "$SB/scripts/workflow/resolve-commit-brief.sh" --session D902 "docs/x.md" 2>/tmp/d839-res.err)
RES_ERR=$(cat /tmp/d839-res.err 2>/dev/null || true)
assert_contains "$RES_OUT" "D902-b.md" "场景A resolver 源头已剔除已释放 brief → 返回本 session 的 brief"
assert_not_contains "$RES_OUT" "D901-a.md" "场景A resolver 不再返回已完成任务的 brief"
assert_contains "$RES_ERR" "SYNO-RELEASED-CLAIM" "场景A resolver 公告被剔除的已释放认领（供门禁降 warn）"
assert_contains "$RES_ERR" "D901" "场景A 公告点名 D901"

scen_end SCEN_A
scen_start
echo "── 场景 B（反向）: 任务 A 仍在进行(claimed) → 仍必须 block ──"
mk_state D901 claimed
run_guard D902
assert_eq "$EC" "1" "场景B exit 1（硬阻断保持）"
assert_contains "$OUT" '"status": "block"' "场景B status=block（并发保护未放松）"
assert_contains "$OUT" "claim_release.py release" "场景B block 文案含可执行释放命令"

scen_end SCEN_B
scen_start
echo "── 场景 D（降级 fail-closed）: 任务 A 无 task-state 卡 → 不释放，仍 block ──"
mk_state D901 NONE
run_guard D902
assert_eq "$EC" "1" "场景D exit 1（拿不到已完成证据 → 不放行）"
assert_contains "$OUT" '"status": "block"' "场景D status=block（fail-closed）"

scen_end SCEN_D
scen_start
echo "── 场景 C（持久化）: 显式释放 + status 漂移 + brief 回 ASCII + declare-write-set 重跑 → 不复活 ──"
if [ ! -f "$CLAIM" ]; then
  fail "场景C claim_release.py 不存在（未实现）"
else
  mk_state D901 impl_done
  RL=$(cd "$SB" && python3 "$CLAIM" --repo "$SB" release --task D901 --reason "夹具: 任务已完成" 2>&1); RLEC=$?
  assert_eq "$RLEC" "0" "场景C 显式释放 exit 0"
  assert_contains "$RL" "claim-releases.json" "场景C 释放落到台账（非 brief 文本）"
  mk_state D901 claimed                     # status 漂移（模拟后续误改）
  # 造出真实变更 + 必须 cd 沙箱（否则 git rev-parse --show-toplevel = 真实仓库 → 越界）
  printf 'y\n' >> "$SB/docs/x.md"
  git -C "$SB" add docs/x.md >/dev/null 2>&1
  (cd "$SB" && bash "$SB/scripts/control-tower/declare-write-set.sh" \
     --brief "$SB/.claude/task-briefs/${TODAY}-D901-a.md" --staged) >/dev/null 2>&1
  assert_contains "$(cat "$SB/.claude/task-briefs/${TODAY}-D901-a.md")" "| docs/x.md |" "场景C declare-write-set 重跑确实用 ASCII 重生成机器块"
  run_guard D902
  assert_eq "$EC" "0" "场景C 重跑后 exit 0（认领不复活）"
  assert_not_contains "$OUT" '"status": "block"' "场景C 释放持久化 → status 漂移也不复活"
fi

scen_end SCEN_C
scen_start
echo "── 场景 E（批量扫描 / 批量释放）──"
if [ ! -f "$CLAIM" ]; then
  fail "场景E claim_release.py 不存在（未实现）"
else
  mk_state D901 impl_done
  SC=$(cd "$SB" && python3 "$CLAIM" --repo "$SB" scan --json 2>&1)
  assert_contains "$SC" '"stale"' "场景E scan 输出含 stale 列表"
  assert_contains "$SC" "D901" "场景E scan 认出失效认领 D901"
  RS=$(cd "$SB" && python3 "$CLAIM" --repo "$SB" release-stale --apply 2>&1)
  assert_eq "$?" "0" "场景E release-stale --apply exit 0"
  assert_contains "$RS" "D901" "场景E 批量释放点名 D901"
  SC2=$(cd "$SB" && python3 "$CLAIM" --repo "$SB" scan --json 2>&1)
  if echo "$SC2" | grep -q '"released": false'; then fail "场景E 批量释放后仍有未释放项"; else pass "场景E 批量释放后 released 全 true"; fi
fi

scen_end SCEN_E
echo "── 场景 F（沙箱围栏）: 测试不得写真实仓库 ──"
scen_start
if [ -f "$REAL_LEDGER" ]; then REAL_LEDGER_NOW=$(shasum -a 256 "$REAL_LEDGER" | cut -d' ' -f1); else REAL_LEDGER_NOW="ABSENT"; fi
if [ "$REAL_LEDGER_SIG" = "$REAL_LEDGER_NOW" ]; then
  pass "场景F 真实仓库释放台账指纹未变（${REAL_LEDGER_NOW}）"
else
  fail "场景F 测试越界改写了真实仓库释放台账（$REAL_LEDGER_SIG → ${REAL_LEDGER_NOW}）"
fi
for _p in task-state/D901.json task-state/D902.json; do
  [ -e "$REPO_DIR/$_p" ] && fail "场景F 测试越界写入真实仓库 $_p" || pass "场景F 真实仓库无 ${_p}（无越界）"
done
scen_end SCEN_F
echo "──────────────────────────────────────────────"
echo "  场景A(放行)      : $SCEN_A"
echo "  场景B(反向仍拦)   : $SCEN_B"
echo "  场景C(持久化)     : $SCEN_C"
echo "  场景D(降级不放行) : $SCEN_D"
echo "  场景E(批量)       : $SCEN_E"
echo "  场景F(沙箱围栏)   : $SCEN_F"
echo "  PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] && echo "FAIL=0" || echo "FAIL=$FAIL"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
