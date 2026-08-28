#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# hard-gate-convergence.test.sh — D515 项3: 提交端硬阻断收敛到 4 道（重中之重）
#
# 10 类历史拦截场景（源自 pre-commit-failures.log 真实案例类别）:
#   4 保（质量根，硬阻断）: ①as any ②测试配对+expect ③Secrets ④接线物理事实
#     + 特例 G12d 生成物单点 / G13 技能同步（spec 明示保留）
#   6 放（软提示，不拦本地提交）: ⑤架构边界 ⑥brief 六字段/G12 认领 ⑦契约门禁
#     ⑧empty catch ⑨plan-integrity/Q2 类 ⑩DiagnosticModule/专家配置
# 覆盖矩阵: 结构断言（10 场景 hard/soft 归属）+ 行为断言（as any 实拦 / G12 越界实放）
# 沙箱: 行为断言在本仓库暂存探针文件，trap 保证清理（禁止 stash，铁律 0-3）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PC="$REPO/scripts/pre-commit-check.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
PROBE1="$REPO/src/tmp-d515-asany-probe.ts"
PROBE2="$REPO/scripts/tmp-d515-scope-probe.json"
cleanup() {
  # 逐个清理（一次性多 pathspec 在其中一个不存在时会整体失败——本测试踩过的坑）
  for f in "$PROBE1" "$PROBE2"; do
    git -C "$REPO" restore --staged -- "$f" >/dev/null 2>&1 || true
    git -C "$REPO" rm --cached -q -- "$f" >/dev/null 2>&1 || true
  done
  rm -f "$PROBE1" "$PROBE2"
}
trap cleanup EXIT

echo "=== D515 项3: 硬阻断收敛（10 场景：4 保 6 放）==="

# ── 结构断言: 4 保 + 2 特例仍是 hard_check ──
KEEP_HARD=(
  'hard_check "as any / as never / as unknown as 零容忍（新增，铁律 38；存量独立清理）"'
  'hard_check "新文件配对: impl 须同 commit 有 test"'
  'hard_check "桩测试: 新测试需 ≥3 expect()"'
  'hard_check "接线审计: 新 export 必须被引用 (物理事实)"'
  'hard_check "接线深度: 新 export 必须被调用(非仅 import)"'
  'hard_check "G12d: 生成物单点生成门禁 (D458)"'
  'hard_check "G13: 技能漂移'
)
for k in "${KEEP_HARD[@]}"; do
  grep -qF "$k" "$PC" && ok "保[硬]: $k" || no "质量根被误降级: $k"
done
# Secrets 仍硬: par_collect secrets 失败 → HARD_FAIL
grep -q 'par_collect secrets.*HARD_FAIL' "$PC" && ok "保[硬]: Secrets (par_collect → HARD_FAIL)" || no "Secrets 被降级"

# ── 结构断言: 6 改软 ──
KEEP_SOFT=(
  'soft_check "架构边界: 禁止跨层引用 (铁律 39)"'
  'soft_check "Task Brief: 6 核心字段必须填写 (Q0/Q1/Q2/Q3/架构层/Done)"'
  'soft_check "G12: task brief Q2 范围一致性"'
  'soft_check "契约门禁: 声明产出须在暂存区"'
  'soft_check "empty catch 无 log (铁律 24+31)"'
  'soft_check "禁止 DiagnosticModule: 新模块须实现 Sentinel 接口"'
)
for k in "${KEEP_SOFT[@]}"; do
  grep -qF "$k" "$PC" && ok "放[软]: $k" || no "未按 spec 降软: $k"
done
grep -q 'V5 软提示——CI 为权威，本地不阻断' "$PC" && ok "soft_check 输出标记 V5 软提示" || no "软提示标记缺失"
grep -q '⚠ V5: \${SOFT_COUNT} 项软提示' "$PC" && ok "结果汇总行存在（X 项软提示）" || no "汇总行缺失"

# ── 行为断言A: as any 探针 → 实际硬拦（exit 1）──
echo 'export const probeVal = (x: unknown) => x as any;' > "$PROBE1"
git -C "$REPO" add -- "$PROBE1" >/dev/null 2>&1
OUTA=$(cd "$REPO" && SYNO_GATEKEEPER_ACK=1 SYNO_SKIP_PARALLEL_WARN=1 \
  SYNO_GATE_HITS_LOG="$(mktemp)" bash "$PC" 2>&1); rcA=$?
[ "$rcA" -eq 1 ] && ok "行为A: as any 探针被硬拦 (exit 1)" || no "行为A: 应 exit 1, 实际 $rcA"
echo "$OUTA" | grep -q "as any / as never / as unknown as 零容忍" && ok "行为A: 命中 as any 零容忍检查点" || no "行为A: 未点名 as any"
echo "$OUTA" | grep -q "提交已拒绝" && ok "行为A: 硬失败输出「提交已拒绝」标记" || no "行为A: 缺硬失败标记"
cleanup

# ── 行为断言A2 (CT-46): as never 探针 → 硬拦（mcp L236 同型逃逸）──
echo 'export const probeNever = (x: unknown) => x as never;' > "$PROBE1"
git -C "$REPO" add -- "$PROBE1" >/dev/null 2>&1
OUTA2=$(cd "$REPO" && SYNO_GATEKEEPER_ACK=1 SYNO_SKIP_PARALLEL_WARN=1 \
  SYNO_GATE_HITS_LOG="$(mktemp)" bash "$PC" 2>&1); rcA2=$?
[ "$rcA2" -eq 1 ] && ok "行为A2: as never 探针被硬拦 (exit 1)" || no "行为A2: 应 exit 1, 实际 $rcA2"
echo "$OUTA2" | grep -q "as any / as never / as unknown as 零容忍" && ok "行为A2: 命中扩展检查点" || no "行为A2: 未点名 as never"
cleanup

# ── 行为断言A3 (CT-46): as unknown as 双断言链 → 硬拦 ──
echo 'export const probeDouble = (x: unknown) => x as unknown as string;' > "$PROBE1"
git -C "$REPO" add -- "$PROBE1" >/dev/null 2>&1
OUTA3=$(cd "$REPO" && SYNO_GATEKEEPER_ACK=1 SYNO_SKIP_PARALLEL_WARN=1 \
  SYNO_GATE_HITS_LOG="$(mktemp)" bash "$PC" 2>&1); rcA3=$?
[ "$rcA3" -eq 1 ] && ok "行为A3: as unknown as 双断言被硬拦 (exit 1)" || no "行为A3: 应 exit 1, 实际 $rcA3"
cleanup

# ── 行为断言A4 (CT-46): 裸 as unknown（合法中间态）→ 不拦（exit 0，防过度阻断）──
# 设计: 追加行到已有跟踪文件（新建 .ts 文件会触发"新文件配对"门禁，测不到组 1 本意）
PROBE_HOST="$REPO/src/agent/diagnosis-launcher.ts"
echo "" >> "$PROBE_HOST"
echo 'const __probeA4 = (x: unknown) => x as unknown; // CT-46 probe' >> "$PROBE_HOST"
git -C "$REPO" add -- "$PROBE_HOST" >/dev/null 2>&1
OUTA4=$(cd "$REPO" && SYNO_GATEKEEPER_ACK=1 SYNO_SKIP_PARALLEL_WARN=1 \
  SYNO_GATE_HITS_LOG="$(mktemp)" bash "$PC" 2>&1); rcA4=$?
[ "$rcA4" -eq 0 ] && ok "行为A4: 裸 as unknown 不误拦 (exit 0)" || no "行为A4: 应 exit 0, 实际 $rcA4 :: $(echo "$OUTA4" | grep -B2 '提交已拒绝' | head -8)"
git -C "$REPO" restore --staged --worktree -- "$PROBE_HOST" >/dev/null 2>&1 || true
cleanup

# ── 行为断言B: G12 越界探针（无 brief 认领的 json）→ 软提示放行（exit 0）──
echo '{}' > "$PROBE2"
git -C "$REPO" add -- "$PROBE2" >/dev/null 2>&1
OUTB=$(cd "$REPO" && SYNO_GATEKEEPER_ACK=1 SYNO_SKIP_PARALLEL_WARN=1 \
  SYNO_GATE_HITS_LOG="$(mktemp)" bash "$PC" 2>&1); rcB=$?
[ "$rcB" -eq 0 ] && ok "行为B: G12 越界只告警不拦 (exit 0)" || no "行为B: 应 exit 0, 实际 $rcB :: $(echo "$OUTB" | grep -B2 '提交已拒绝' | head -8)"
echo "$OUTB" | grep -q "V5 软提示" && ok "行为B: 输出含 V5 软提示标记" || no "行为B: 缺软提示标记"
echo "$OUTB" | grep -q "tmp-d515-scope-probe.json" && ok "行为B: 越界文件被点名（报告能力不减）" || no "行为B: 越界文件未点名"
cleanup

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
