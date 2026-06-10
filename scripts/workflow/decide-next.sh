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
if [ "$PLACE" -gt 0 ] 2>/dev/null; then
  SUGGESTION="消除占位代码: ${PLACE} 个 @state:placeholder 文件。"
  PRIORITY="P0"
elif [ "$SKEL" -gt 5 ] 2>/dev/null; then
  SUGGESTION="升级骨架模块: ${SKEL} 个 @state:skeleton。选一个最有演示价值的模块接真实数据源。"
  PRIORITY="P1"
elif [ "$REAL_REPORT_EXISTS" -eq 1 ] && [ "$V2_EXISTS" -eq 1 ]; then
  SUGGESTION="端到端管线已跑通(V2+真实API)。下一步: 启动Express服务器 → 浏览器测试 POST /api/diagnosis/upload → 看真实报告。验证完整的HTTP链路。"
  PRIORITY="P0"
elif [ "$SAMPLE_REPORT_EXISTS" -eq 1 ]; then
  SUGGESTION="骨架已跑通(mock)。下一步: 接真实 DeepSeek API 跑端到端管线。"
  PRIORITY="P0"
else
  SUGGESTION="跑通 MVP 管线: 文档上传 → 八维度提取 → 报告生成。"
  PRIORITY="P0"
fi

echo -e "  ${GREEN}建议:${NC} ${SUGGESTION}"
echo -e "  ${YELLOW}优先级:${NC} ${PRIORITY}""
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
