#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# 节点 ②: 设计对齐检查点 (Post-Design)
#
# 触发: 人工 — 设计文档写完后、写代码之前
# 用法: bash scripts/workflow/checkpoint-design.sh <设计文档路径>
#
# Anthropic 原则: 设计文档缺触发定义/结果呈现 = 设计未完成 = 禁止编码
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RESET='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

DESIGN_DOC="${1:-}"
FAIL=0

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
echo -e "${CYAN}  Anthropic 设计对齐 — 写代码之前最后确认${RESET}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
echo ""

if [ -z "$DESIGN_DOC" ]; then
  echo -e "  ${YELLOW}用法: checkpoint-design.sh <设计文档路径>${RESET}"
  echo "  示例: checkpoint-design.sh docs/research/my-feature.html"
  echo ""
  echo "  如果还没有设计文档，请先创建。"
  echo "  参考: 铁律 2 — 每个能力必须带触发定义 + 结果呈现"
  exit 0
fi

if [ ! -f "$DESIGN_DOC" ] && [ ! -f "$ROOT/$DESIGN_DOC" ]; then
  # Try relative to ROOT
  DESIGN_DOC="$ROOT/$DESIGN_DOC"
fi
if [ ! -f "$DESIGN_DOC" ]; then
  echo -e "  ${RED}❌ 设计文档不存在: ${DESIGN_DOC}${RESET}"
  exit 1
fi

# ═══ Q1: 触发定义 ═══
echo -e "${CYAN}🔍 Q1: 触发定义 (铁律 2)${RESET}"
echo ""
if grep -qi "触发方式\|谁来触发\|触发入口\|触发频率\|用户点击\|cron\|hook\|手动" "$DESIGN_DOC" 2>/dev/null; then
  echo -e "  ${GREEN}✅ 有触发定义${RESET}"
else
  echo -e "  ${RED}❌ 缺少触发定义${RESET}"
  echo "    必须说明: 谁来触发 / 何时触发 / 触发入口在哪里"
  FAIL=1
fi

# ═══ Q2: 结果呈现 ═══
echo -e "${CYAN}🔍 Q2: 结果呈现 (铁律 2)${RESET}"
echo ""
if grep -qi "结果呈现\|用户看到\|展示\|UI\|通知\|面板\|卡片\|banner\|消息\|显示" "$DESIGN_DOC" 2>/dev/null; then
  echo -e "  ${GREEN}✅ 有结果呈现${RESET}"
else
  echo -e "  ${RED}❌ 缺少结果呈现${RESET}"
  echo "    必须说明: 用户在哪里看到结果 / 什么形式"
  FAIL=1
fi

# ═══ Q3: 垂直切片 ═══
echo -e "${CYAN}🔍 Q3: 垂直切片 (铁律 1)${RESET}"
echo ""
if grep -qi "完整链路\|端到端\|触发.*结果\|数据流\|用户旅程" "$DESIGN_DOC" 2>/dev/null; then
  echo -e "  ${GREEN}✅ 有完整链路描述${RESET}"
else
  echo -e "  ${YELLOW}⚠ 未明确描述完整链路 — 确认不是水平分层交付${RESET}"
fi

# ═══ Q4: 架构分层 ═══
echo -e "${CYAN}🔍 Q4: 架构分层 (铁律 39)${RESET}"
echo ""
# Check if doc mentions cross-layer patterns
CROSS_LAYER=0
if grep -qi "直接.*数据库\|直接.*SQLite\|跳过.*L4\|绕过.*编排" "$DESIGN_DOC" 2>/dev/null; then
  echo -e "  ${RED}❌ 设计中有跨层引用 — 需要重新设计${RESET}"
  CROSS_LAYER=1
  FAIL=1
fi
if grep -qi "L1\|L2\|L3\|L4\|L5\|交互层\|编排层\|洞察层\|本体层\|存储层" "$DESIGN_DOC" 2>/dev/null; then
  echo -e "  ${GREEN}✅ 明确了架构分层${RESET}"
elif [ "$CROSS_LAYER" -eq 0 ]; then
  echo -e "  ${YELLOW}⚠ 未明确标注架构分层 — 请在文档中标注${RESET}"
fi

# ═══ Q5: OpenClaw 边界 ═══
echo -e "${CYAN}🔍 Q5: 底座能力边界 (铁律 25)${RESET}"
echo ""
if grep -qi "agent.*通信\|agent.*消息\|跨.*agent\|gateway.*路由\|agent.*组\|团队.*agent" "$DESIGN_DOC" 2>/dev/null; then
  echo -e "  ${RED}❌ 设计依赖 OpenClaw 不原生支持的能力${RESET}"
  echo "    OpenClaw 没有: Agent 间消息路由 / 团队组概念 / 跨 Agent 状态共享"
  echo "    这些都是我们自己搭的骨架，不是底座能力。"
  echo "    请标注"需要自建"并评估工程量。"
  FAIL=1
else
  echo -e "  ${GREEN}✅ 无底座能力边界冲突${RESET}"
fi
echo ""

# ═══ 结果 ═══
echo -e "${CYAN}────────────────────────────────────────────────────────────${RESET}"
if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}✅ 设计对齐通过 — 可以开始写代码${RESET}"
else
  echo -e "  ${RED}❌ 设计未完成 — 修改设计后再运行此检查${RESET}"
  echo "  铁律 2: 缺触发定义或结果呈现 = 设计未完成 = 禁止编码"
fi
echo -e "${CYAN}────────────────────────────────────────────────────────────${RESET}"
echo ""

exit $FAIL
