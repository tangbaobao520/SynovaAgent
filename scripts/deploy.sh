#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# SynovaAgent 生产部署脚本
#
# 用法: bash scripts/deploy.sh [user@host]
#
# 示例: bash scripts/deploy.sh root@43.160.196.159
#       bash scripts/deploy.sh                    # 本地 Docker 部署
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; RED='\033[0;31m'; RESET='\033[0m'
REMOTE="${1:-}"

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${RESET}"
echo -e "${CYAN}  SynovaAgent 部署${RESET}"
echo -e "${CYAN}═══════════════════════════════════════════════════${RESET}"
echo ""

# ═══ Step 1: 检查前置条件 ═══
echo -e "${CYAN}[1/5] 检查前置条件...${RESET}"

if [ -n "$REMOTE" ]; then
  echo "  目标: ${REMOTE}"
  ssh "$REMOTE" "which docker && which docker-compose || which docker compose" || {
    echo -e "${RED}远程服务器缺少 Docker — 请先安装 Docker${RESET}"; exit 1;
  }
else
  which docker || { echo -e "${RED}本地未安装 Docker — 请先安装 Docker Desktop${RESET}"; exit 1; }
fi
echo -e "  ${GREEN}✅ Docker 可用${RESET}"

# ═══ Step 2: 构建镜像 ═══
echo -e "${CYAN}[2/5] 构建 Docker 镜像...${RESET}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Docker build 需要 monorepo 上下文 (engine-core 在 ../server/vendor/)
cd "$ROOT/.."
docker build -t synova-agent:latest -f synova-agent/Dockerfile .

echo -e "  ${GREEN}✅ 镜像构建完成${RESET}"

# ═══ Step 3: 推送到远程 ═══
if [ -n "$REMOTE" ]; then
  echo -e "${CYAN}[3/5] 推送到远程服务器...${RESET}"
  docker save synova-agent:latest | gzip | ssh "$REMOTE" "gunzip | docker load"
  scp "$ROOT/docker-compose.yml" "${REMOTE}:~/synova-agent/"
  scp "$ROOT/.env" "${REMOTE}:~/synova-agent/.env" 2>/dev/null || echo "  ⚠ .env 未找到，请在服务器上手动创建"
  echo -e "  ${GREEN}✅ 已推送到 ${REMOTE}${RESET}"
else
  echo -e "${CYAN}[3/5] 跳过推送 (本地部署)${RESET}"
fi

# ═══ Step 4: 启动服务 ═══
echo -e "${CYAN}[4/5] 启动服务...${RESET}"

if [ -n "$REMOTE" ]; then
  ssh "$REMOTE" "cd ~/synova-agent && docker compose down 2>/dev/null; docker compose up -d"
else
  cd "$ROOT"
  docker compose down 2>/dev/null || true
  docker compose up -d
fi
echo -e "  ${GREEN}✅ 服务已启动${RESET}"

# ═══ Step 5: 验证 ═══
echo -e "${CYAN}[5/5] 验证部署...${RESET}"
sleep 5

if [ -n "$REMOTE" ]; then
  HEALTH=$(ssh "$REMOTE" "curl -s http://localhost:3000/health" || echo '{"status":"down"}')
else
  HEALTH=$(curl -s http://localhost:3000/health 2>/dev/null || echo '{"status":"down"}')
fi

STATUS=$(echo "$HEALTH" | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
if [ "$STATUS" = "ok" ]; then
  echo -e "  ${GREEN}✅ 部署成功 — SynovaAgent 运行中${RESET}"
else
  echo -e "  ${RED}❌ 健康检查失败 — 查看日志: docker compose logs synova-agent${RESET}"
fi

echo ""
echo "  访问: http://localhost:3000"
echo "  健康: http://localhost:3000/health"
echo "  Web:  http://localhost:3000/"
echo ""
