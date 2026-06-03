#!/usr/bin/env bash
# SynovaAgent 一键安装脚本 (macOS / Linux)
# 用法: curl -fsSL https://raw.githubusercontent.com/.../install.sh | bash
set -euo pipefail

BOLD='\033[1m'; GREEN='\033[32m'; YELLOW='\033[33m'; RED='\033[31m'; CYAN='\033[36m'; NC='\033[0m'

echo ""
echo -e "${BOLD}${CYAN}  SynovaAgent 安装程序${NC}"
echo -e "  组织数字孪生诊断 Agent"
echo ""

# ── 1. 检查 Node.js ──
if ! command -v node &>/dev/null; then
  echo -e "${RED}❌ 未检测到 Node.js${NC}"
  echo "  SynovaAgent 需要 Node.js >= 20"
  echo "  安装: https://nodejs.org 或使用 nvm / fnm"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo -e "${RED}❌ Node.js 版本过低 (当前: $(node -v), 需要 >= 20)${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Node.js $(node -v)${NC}"

# ── 2. 检查 npm ──
if ! command -v npm &>/dev/null; then
  echo -e "${RED}❌ 未检测到 npm${NC}"
  exit 1
fi
echo -e "${GREEN}✅ npm $(npm -v)${NC}"

# ── 3. 选择安装目录 ──
INSTALL_DIR="${SYNOVA_HOME:-$HOME/.synova-agent}"
echo ""
echo -e "安装目录: ${CYAN}${INSTALL_DIR}${NC}"
if [ -d "$INSTALL_DIR" ]; then
  echo -e "${YELLOW}⚠️  目录已存在，将更新安装${NC}"
fi

# ── 4. 克隆/下载 ──
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "更新现有安装..."
  cd "$INSTALL_DIR"
  git pull --ff-only
else
  echo "下载 SynovaAgent..."
  # 如果当前目录就是项目源码，直接复制
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)/.."
  if [ -f "$SCRIPT_DIR/package.json" ] && grep -q "synova-agent" "$SCRIPT_DIR/package.json" 2>/dev/null; then
    echo "从本地源码安装: $SCRIPT_DIR"
    mkdir -p "$INSTALL_DIR"
    cp -r "$SCRIPT_DIR"/* "$INSTALL_DIR"/
  else
    echo -e "${YELLOW}⚠️  请先 clone 项目到本地，然后运行: cd synova-agent && bash scripts/install.sh${NC}"
    exit 1
  fi
fi

# ── 5. 安装依赖 ──
cd "$INSTALL_DIR"
echo "安装依赖..."
npm install --omit=dev 2>&1 | tail -3

# ── 6. 创建数据目录 ──
mkdir -p "$INSTALL_DIR/data"

# ── 7. 配置 LLM ──
if [ -z "${LLM_API_KEY:-}" ] && [ -z "${DEEPSEEK_API_KEY:-}" ] && [ -z "${OPENCLAW_GATEWAY_HOST:-}" ]; then
  echo ""
  echo -e "${YELLOW}⚠️  未检测到 LLM 配置${NC}"
  echo "  首次启动时会进入 Setup 向导，或手动设置："
  echo ""
  echo "  export LLM_API_KEY=sk-your-deepseek-key"
  echo "  node dist/index.js"
else
  echo -e "${GREEN}✅ LLM 配置已检测到${NC}"
fi

# ── 8. 完成 ──
echo ""
echo -e "${GREEN}${BOLD}✅ SynovaAgent 安装完成！${NC}"
echo ""
echo "  启动:"
echo -e "    ${CYAN}cd ${INSTALL_DIR} && node dist/index.js${NC}"
echo ""
echo "  或使用 tsx 开发模式:"
echo -e "    ${CYAN}cd ${INSTALL_DIR} && npx tsx src/index.ts${NC}"
echo ""
echo "  对话模式:"
echo -e "    ${CYAN}npx tsx src/cli.ts${NC}"
echo ""
echo "  Web 界面:"
echo -e "    ${CYAN}http://localhost:3000${NC}"
echo ""
