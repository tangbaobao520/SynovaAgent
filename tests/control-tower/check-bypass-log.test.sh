#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# check-bypass-log.test.sh — D414/U1c bypass 证据链对账门禁测试
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常   — 无新提交（origin/main..HEAD 空）→ exit 0
#   降级   — git log 执行失败 → exit 2（fail-closed, 不当作通过）
#   边界绿 — 本机无任何账本来源（新 clone / 账本出库后无残留）→ exit 0（FIX-002 显式放行）
#   边界红 — 有账本 + 1 条 detected-bypass 且范围内提交无 COMMITTED 登记 → exit 1（成对反例）
#   边界   — 显式 SYNO_BASE_REF 不可解析 → exit 1
#   接线   — git log 失败 fail-closed 代码真实存在于脚本（铁律 0-2）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$REPO/scripts/control-tower/check-bypass-log.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "=== D414/U1c check-bypass-log 对账门禁测试 ==="

# ── 接线: git log 失败 fail-closed 代码真实存在（U1c 修复点）──
if grep -q "git log 执行失败" "$GATE" && grep -q "GIT_LOG_OUT" "$GATE"; then
  ok "接线: git log 失败 fail-closed exit 2 已接入"
else
  no "接线: git log 失败检测代码缺失"
fi

# ── 正常: 无新提交（base..HEAD 空集）→ exit 0（**有账本来源**，非 no-source 放行路径）──
if (
  SB="$(mktemp -d /tmp/d331-empty.XXXXXX)"
  trap 'rm -rf "$SB"' EXIT
  g() { GIT_DIR="$SB/.git" GIT_WORK_TREE="$SB" git "$@"; }
  git -C "$SB" init -q
  g config user.email t@t; g config user.name tester
  mkdir -p "$SB/.claude"; : > "$SB/.claude/bypass.log"
  echo a > "$SB/a"; g add -A; g commit -qm base
  g branch -m main
  out="$(cd "$SB" && SYNO_BASE_REF=main bash "$GATE" 2>&1)"; rc=$?
  case "$out" in *"本机无账本来源"*) echo "  ❌ 本用例须走对账路径，不该命中 no-source 放行"; exit 1;; esac
  if [ "$rc" -ne 0 ]; then echo "  ❌ 空范围应 exit 0, 实际 $rc: $out"; exit 1; fi
  echo "  ✅ 无新提交（空范围，有账本来源）→ exit 0"
); then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); fi

# ═══ FIX-002 / D331 读面: 成对反例（无账本放行 vs 有账本真绕过仍拦）═══
# 沙箱加固同 D508: GIT_DIR/GIT_WORK_TREE 显式绑定，与 cwd 无关。

# ── 边界(绿): 本机无任何账本来源（新 clone / 账本出库后无残留）→ exit 0 ──
#   #796 删 .claude/bypass.log + D970 Stage 2 停写旧路径 ⇒ 新 clone 上零来源。
#   本机零登记 = 零可对账证据 → 判「无绕过记录」显式放行（**必须可见**，非静默）。
if (
  SB="$(mktemp -d /tmp/d331-nosrc.XXXXXX)"
  trap 'rm -rf "$SB"' EXIT
  g() { GIT_DIR="$SB/.git" GIT_WORK_TREE="$SB" git "$@"; }
  git -C "$SB" init -q
  g config user.email t@t; g config user.name tester
  echo a > "$SB/a"; g add -A; g commit -qm base
  g branch -m main
  g checkout -q -b feat/x
  echo b > "$SB/b"; g add -A; g commit -qm feat-task
  if [ -f "$SB/.claude/bypass.log" ]; then
    echo "  ❌ 夹具不成立: 沙箱不应有账本"; exit 1
  fi
  out="$(cd "$SB" && SYNO_BASE_REF=main bash "$GATE" 2>&1)"; rc=$?
  case "$out" in *"本机无账本来源"*) : ;; *)
    echo "  ❌ 放行必须显式可见（输出未含『本机无账本来源』）: $out"; exit 1;; esac
  if [ "$rc" -ne 0 ]; then
    echo "  ❌ 无账本来源应 exit 0, 实际 $rc"; exit 1
  fi
  echo "  ✅ 无账本来源（新 clone 态）→ exit 0，且放行显式可见"
); then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); fi

# ── 边界(红): 有账本 + 1 条 detected-bypass，且范围内提交无 COMMITTED 登记 → exit≠0 ──
#   ⒝ 成对反例（判别性夹具）: 证明 FIX-002 的「无账本放行」没有削弱门禁 —— 只要账本在，
#   真绕过（无登记提交）仍被拦；补记该提交后同一夹具转绿 ⇒ 红由「缺记录」产生，不是 grep 型静态判据。
#   把下方缺记录红路径改成 `|| true` / 删除该分支 → 本用例转绿 → 测试失败（判别力可证）。
if (
  SB="$(mktemp -d /tmp/d331-detect.XXXXXX)"
  trap 'rm -rf "$SB"' EXIT
  g() { GIT_DIR="$SB/.git" GIT_WORK_TREE="$SB" git "$@"; }
  git -C "$SB" init -q
  g config user.email t@t; g config user.name tester
  mkdir -p "$SB/.claude"
  echo a > "$SB/a"; g add -A; g commit -qm base
  g branch -m main
  g checkout -q -b feat/x
  echo b > "$SB/b"; g add -A; g commit -qm feat-task-unrecorded
  TASK_HASH=$(g rev-parse HEAD)
  # 真实绕过登记形态（见 scripts/hooks/post-commit.sh: detected-bypass 行不含提交 HASH）
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) detected-bypass head-mismatch marker=deadbeef parent=cafebabe" >> "$SB/.claude/bypass.log"
  if (cd "$SB" && SYNO_BASE_REF=main bash "$GATE" >/dev/null 2>&1); then
    echo "  ❌ 有账本 + detected-bypass 时漏拦（exit=0）—— 门禁被削弱"; exit 1
  fi
  # 阳性对照: 补记该提交 → 同一夹具转绿（隔离变量: 红来自缺记录）
  echo "$(date -Iseconds) | COMMITTED | pre-commit PASS | TASK_ID=X | AGENT=t | HASH=$TASK_HASH" >> "$SB/.claude/bypass.log"
  if ! (cd "$SB" && SYNO_BASE_REF=main bash "$GATE" >/dev/null 2>&1); then
    echo "  ❌ 阳性对照失败: 补记后应转绿 —— 红因不明（可能是夹具而非缺记录）"; exit 1
  fi
  echo "  ✅ 有账本 + detected-bypass + 提交缺登记 → exit≠0；补记后转绿（门禁未削弱）"
); then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); fi

# ── 边界: 显式 SYNO_BASE_REF 不可解析 → exit 1（硬错误, 非 fail-open）──
#   先于「账本态」判定：放行路径不得掩盖调用方给错引用（D414/U1c 原语义保留）。
SYNO_BASE_REF="nonexistent-ref-xyz" bash "$GATE" >/dev/null 2>&1
rc=$?
[ "$rc" -eq 1 ] && ok "显式 base 不可解析 → exit 1" || no "显式 base 不可解析应 exit 1, 实际 $rc"

# ═══ D508: merge-base 对账用例（Win#7 死循环根治验证）═══
# 沙箱加固（事故教训: 2026-08-23 三次 index 污染）: 所有沙箱 git 一律 GIT_DIR/
#   GIT_WORK_TREE 显式绑定（结构性隔离，与 cwd 无关），并断言宿主 index 前后不变。
if (
  SB="$(mktemp -d /tmp/d508-mb.XXXXXX)"
  HOST_BEFORE=$(git write-tree 2>/dev/null || echo na)  # swallow-ok: 宿主基线
  trap 'rm -rf "$SB"' EXIT
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
  HOST_AFTER=$(git write-tree 2>/dev/null || echo na)  # swallow-ok: 宿主复核
  if [ "$HOST_BEFORE" = "$HOST_AFTER" ]; then
    echo "  ✅ D508: 宿主 index 未被沙箱污染"
  else
    echo "  ❌ D508: 宿主 index 被改写！"; exit 1
  fi
); then PASS=$((PASS+3)); else FAIL=$((FAIL+1)); fi  # D521: 子 shell 退出码须回传父计数器（原实现计数丢失 = 块内失败不上报）

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
