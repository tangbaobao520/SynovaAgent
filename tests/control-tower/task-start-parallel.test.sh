#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# task-start-parallel.test.sh — D515 项1: 并行隔离物理强制（开工端拦截）
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常(拦) — 主树脏 + registry 有活跃 session → exit 1 + worktree 提示
#   正常(放) — 主树脏但无活跃 session → 不拦截（brief 生成，零摩擦）
#   降级     — registry 不可读 → 显式降级提示，不拦截
#   边界     — worktree 内允许（结构断言: /.git/worktrees/ 分支存在）
#   接线     — SYNO_SKIP_PARALLEL_GUARD / session_registry 调用真实存在
# 沙箱: mktemp 仓库 + 复制 scripts/（M13: git 身份一律 -c 一次性参数）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TS="$REPO/scripts/workflow/task-start.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT

echo "=== D515 项1: task-start 并行隔离物理强制 ==="

# ── 接线 ──
grep -q "SYNO_SKIP_PARALLEL_GUARD" "$TS" && grep -q "session_registry.py" "$TS" \
  && ok "接线: task-start 并行拦截逻辑已接入" || no "接线: 拦截逻辑缺失"
grep -q 'worktree-manager.py create' "$TS" && ok "接线: 提示文案含 worktree 创建命令" || no "提示文案缺 worktree 命令"
grep -q '"/.git/worktrees/"' "$TS" && ok "边界: worktree 内放行分支存在" || no "worktree 放行分支缺失"

# ── 沙箱: 复制 scripts + 建 git 仓库（M13: 无 git config 持久写入）──
SB="$TMPD/sb"; mkdir -p "$SB"
cp -R "$REPO/scripts" "$SB/scripts"
git -C "$SB" init -q
echo dirty > "$SB/dirty-file.txt"
export SYNO_CT_DIR="$TMPD/ct"; mkdir -p "$SYNO_CT_DIR"

# ── 场景A: 主树脏 + 1 个活跃 session → exit 1 ──
python3 "$SB/scripts/control-tower/session_registry.py" register --session-id other-sess --brief "" --task-id D999 >/dev/null 2>&1
ACT=$(python3 "$SB/scripts/control-tower/session_registry.py" list --active </dev/null 2>/dev/null || true)
echo "$ACT" | grep -q other-sess && ok "前置: 沙箱 registry 有活跃 session" || no "前置失败: registry 注册未生效"

OUT=$(cd "$SB" && bash "$SB/scripts/workflow/task-start.sh" "并行测试任务" 2>&1); rc=$?
[ "$rc" -eq 1 ] && ok "双 session 场景: task-start 拦截 (exit 1)" || no "应拦截, 实际 exit=$rc"
echo "$OUT" | grep -q "worktree-manager.py create" && ok "拦截输出含 worktree 创建命令" || no "拦截输出缺命令提示"

# ── 场景B: 无活跃 session → 不拦截（brief 生成 = 走到后续流程）──
rm -rf "$SYNO_CT_DIR"; export SYNO_CT_DIR="$TMPD/ct2"; mkdir -p "$SYNO_CT_DIR"
OUT2=$(cd "$SB" && bash "$SB/scripts/workflow/task-start.sh" "单人测试任务" 2>&1); rc2=$?
[ "$rc2" -eq 0 ] && ok "单人场景: 不拦截 (exit 0)" || no "单人不应拦截, exit=$rc2 :: $OUT2"

# ── 场景C: registry 输出不可解析 → 显式降级不静默 ──
grep -q "session-registry 不可读" "$TS" && ok "降级: 不可读时显式提示代码存在" || no "降级提示缺失"

# ── D520/任务1: Windows CRLF 回归用例 ──
# 病根：python 输出经 Windows 管道带 \r → [[ "3\r" -gt 0 ]] 算术错误 → 拦截空转。
# 断言清洗逻辑真实存在且语义正确（模拟 _PAR_N="3\r" / "0"）。
echo ""
echo "── D520: CRLF 回归用例 ──"
TS_SRC="$(grep -cF "tr -d '\r\n'" "$TS")"
[ "$TS_SRC" -ge 1 ] && ok "接线: tr -d '\\r\\n' 清洗存在（D520 任务1）" || no "缺 \\r 清洗（Win 下拦截空转）"
grep -qF '_PAR_N//' "$TS" && grep -qF '//[^0-9]/' "$TS" && ok "接线: 二次数字清洗 \${_PAR_N//[^0-9]/} 存在" || no "缺二次数字清洗"
# 行为: 模拟 CRLF 残留值过清洗逻辑（与脚本同型双步清洗）
sim_clean() { printf '%s' "$1" | tr -d '\r\n'; }
V=$(sim_clean "$(printf '3\r')"); V="${V//[^0-9]/}"
[ "$V" = "3" ] && ok "行为: \"3\\r\" 清洗后 = 3（算术可用，拦截可达）" || no "清洗失败: 得到 '$V'"
V0=$(sim_clean "0"); V0="${V0//[^0-9]/}"
[ "$V0" = "0" ] && ok "行为: \"0\" 保持 0（单人语义保留，不误拦）" || no "单人语义被破坏: '$V0'"

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
