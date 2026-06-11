#!/usr/bin/env bash
# decide-next.sh — 完成任务后，按 Anthropic 决策流程提出下一步建议
# 铁律 0: 每个任务完成后审视全局。post-commit 自动触发。必须瞬时完成。
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Anthropic 决策流程 — 下一步行动建议"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ═══ 1. 最近完成 ═══
echo -e "${CYAN}── 1. 最近完成 ──────────────────────────────────────${NC}"
git log --oneline -5 2>/dev/null | while read -r line; do
  echo "  $line"
done
echo ""

# ═══ 2. 代码健康度 (从 STATE.md 缓存读取, 瞬时) ═══
echo -e "${CYAN}── 2. 代码健康度 ────────────────────────────────────${NC}"
if [ -f "$REPO_ROOT/STATE.md" ]; then
  REAL=$(grep -c '🟢' "$REPO_ROOT/STATE.md" 2>/dev/null | head -1 | tr -d ' ' || echo 0)
  SKEL=$(grep -c '🟡' "$REPO_ROOT/STATE.md" 2>/dev/null | head -1 | tr -d ' ' || echo 0)
  PLACE=$(grep -c '🔴' "$REPO_ROOT/STATE.md" 2>/dev/null | head -1 | tr -d ' ' || echo 0)
  echo "  🟢 real:        ${REAL}"
  echo "  🟡 skeleton:    ${SKEL}"
  echo "  🔴 placeholder: ${PLACE}"
  echo "  (运行 bash scripts/generate-state-md.sh 刷新)"
else
  echo "  STATE.md 不存在。运行 bash scripts/generate-state-md.sh 生成。"
  REAL=0; SKEL=0; PLACE=0
fi
echo ""

# ═══ 3. 架构健康 ═══
echo -e "${CYAN}── 3. 架构健康 ──────────────────────────────────────${NC}"
ARCH_OUTPUT=$(bash "$REPO_ROOT/scripts/check-architecture.sh" 2>/dev/null || true)
if echo "$ARCH_OUTPUT" | grep -q '❌'; then
  CROSS=$(echo "$ARCH_OUTPUT" | grep -c '❌' || echo 0)
  echo "  🔴 跨层违规: ${CROSS} 处"
else
  echo "  ✅ 无跨层违规"
fi
echo ""

# ═══ 4. 决策树 (按优先级逐级检查) ═══
echo -e "${CYAN}── 4. 下一步建议 ────────────────────────────────────${NC}"
SUGGESTION=""
PRIORITY=""

# 检查关键模块状态
V2_EXISTS=$(test -f "$REPO_ROOT/src/routes/diagnosis-upload-v2.ts" && echo 1 || echo 0)
REAL_REPORT_EXISTS=$(test -f "$REPO_ROOT/tests/output/mvp-report-real.html" && echo 1 || echo 0)
SAMPLE_REPORT_EXISTS=$(test -f "$REPO_ROOT/tests/output/mvp-sample-report.html" && echo 1 || echo 0)
SERVER_STARTED=$(test -f "$REPO_ROOT/.server.pid" && echo 1 || echo 0)

# 决策逻辑 (从紧急到优化)
# 注: placeholder 计数含 engine-core legacy 文件, 不代表 src/ 目录状态
SRC_PLACE=$(grep -rn "@state:placeholder" "$REPO_ROOT/src/" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ' || echo 0)
SRC_SKEL=$(grep -rn "@state:skeleton" "$REPO_ROOT/src/" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ' || echo 0)

# 检查是否有未提交的变更
UNCOMMITTED=$(git status --porcelain 2>/dev/null | grep -v "^?" | head -1 || true)

if [ -n "$UNCOMMITTED" ]; then
  SUGGESTION="有未提交的代码变更。审查变更 → commit → push → 然后根据全量手册 Phase 0 继续。"
  PRIORITY="P0 (当前)"
elif [ "$SRC_SKEL" -gt 3 ] 2>/dev/null; then
  SUGGESTION="src/ 目录还有 ${SRC_SKEL} 个 skeleton 模块。选一个最有演示价值的接真实数据。"
  PRIORITY="P1"
elif [ "$SRC_PLACE" -gt 0 ] 2>/dev/null; then
  SUGGESTION="src/ 目录有 ${SRC_PLACE} 个 placeholder。清理或接真实实现。"
  PRIORITY="P1"
elif [ "$V2_EXISTS" -eq 1 ]; then
  SUGGESTION="Phase 0 核心已完成(P0-1+P0-3)。下一步: 启动 Express 服务器 → 浏览器测试 → 验证完整 HTTP 链路。或按全量手册进入 Phase 1。"
  PRIORITY="P0 (演示验证)"
else
  SUGGESTION="按全量对齐手册 Phase 0-3 修复路径推进。"
  PRIORITY="P0"
fi

echo -e "  ${GREEN}建议:${NC} ${SUGGESTION}"
echo -e "  ${YELLOW}优先级:${NC} ${PRIORITY}"
echo ""

# ═══ 5. 全局锚点 ═══
echo -e "${CYAN}── 5. 全局锚点 (每次做任务前重温) ─────────────────${NC}"
echo "  Synova = AI 组织诊断系统，核心是服务于增长"
echo "  五层架构: L1交互 → L2编排 → L3洞察 → L4本体 → L5存储"
echo "  六专家: 战略 / 组织 / 财务 / 营销 / 技术 / 行动"
echo "  当前分支: $(git branch --show-current 2>/dev/null || echo 'main')"
echo ""
echo "═══════════════════════════════════════════════════════"
echo ""
