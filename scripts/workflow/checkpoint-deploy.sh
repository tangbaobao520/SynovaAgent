#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# 节点 ⑥: 部署后验证 (Post-Deploy)
#
# 触发: 人工 — 每次部署到服务器后运行
# 用法: bash scripts/workflow/checkpoint-deploy.sh [base_url]
#
# Anthropic 原则: 部署后必须从外部 URL 验证，不能只 curl localhost
# 铁律 17: 每次部署后从外部 URL 验证核心端点
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RESET='\033[0m'

BASE_URL="${1:-http://localhost:3000}"
FAIL=0

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
echo -e "${CYAN}  Anthropic 部署验证 — 外部 URL 检查${RESET}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
echo ""
echo "  目标: ${BASE_URL}"
echo ""

# ═══ Q1: 健康检查 ═══
echo -e "${CYAN}🌐 Q1: 健康检查${RESET}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/health" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  HEALTH=$(curl -s "${BASE_URL}/api/health" 2>/dev/null || echo '{}')
  STATUS=$(echo "$HEALTH" | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
  echo -e "  ${GREEN}✅ HTTP ${HTTP_CODE} — status: ${STATUS}${RESET}"
else
  echo -e "  ${RED}❌ HTTP ${HTTP_CODE} — 服务不可达${RESET}"
  FAIL=1
fi

# ═══ Q2: 核心端点 ═══
echo -e "${CYAN}🔗 Q2: 核心 API${RESET}"

# 本体 API
GRAPH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/ontology/graph/default" 2>/dev/null || echo "000")
if [ "$GRAPH_CODE" = "200" ]; then
  echo -e "  ${GREEN}✅ GET /api/ontology/graph/default → 200${RESET}"
else
  echo -e "  ${RED}❌ GET /api/ontology/graph/default → ${GRAPH_CODE}${RESET}"
  FAIL=1
fi

# Agent Observer API
OBSERVER_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/api/agent-observer/report" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"deploy-check","platform":"deploy","name":"部署验证","agentType":"external","activityType":"heartbeat","timestamp":"2026-01-01T00:00:00Z"}' 2>/dev/null || echo "000")
if [ "$OBSERVER_CODE" = "200" ]; then
  echo -e "  ${GREEN}✅ POST /api/agent-observer/report → 200${RESET}"
else
  echo -e "  ${RED}❌ POST /api/agent-observer/report → ${OBSERVER_CODE}${RESET}"
  FAIL=1
fi

# ═══ Q3: HTTPS (生产环境) ═══
echo -e "${CYAN}🔒 Q3: HTTPS${RESET}"
if echo "$BASE_URL" | grep -q "https://"; then
  HTTPS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/health" 2>/dev/null || echo "000")
  if [ "$HTTPS_CODE" = "200" ]; then
    echo -e "  ${GREEN}✅ HTTPS 可达${RESET}"
  else
    echo -e "  ${RED}❌ HTTPS 不可达 — 检查 Nginx 配置${RESET}"
    FAIL=1
  fi
else
  echo -e "  ${YELLOW}⚠ 使用 HTTP (开发环境)${RESET}"
fi
echo ""

# ═══ 结果 ═══
echo -e "${CYAN}────────────────────────────────────────────────────────────${RESET}"
if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}✅ 部署验证通过${RESET}"
else
  echo -e "  ${RED}❌ ${FAIL} 项检查失败 — 请排查${RESET}"
fi
echo -e "${CYAN}────────────────────────────────────────────────────────────${RESET}"
echo ""

exit $FAIL
