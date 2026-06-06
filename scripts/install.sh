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

# ── 6. 安装 PM2 进程守护 ──
PM2_INSTALLED=false
if command -v pm2 &>/dev/null; then
  echo -e "${GREEN}✅ PM2 已安装 ($(pm2 -v))${NC}"
  PM2_INSTALLED=true
else
  echo "安装 PM2 进程守护..."
  if npm install -g pm2 2>&1 | tail -3; then
    echo -e "${GREEN}✅ PM2 已安装${NC}"
    PM2_INSTALLED=true
  else
    echo -e "${YELLOW}⚠️  PM2 全局安装失败 — 将使用 nohup 兜底${NC}"
  fi
fi

# ── 7. 配置开机自启 ──
echo ""
echo "配置开机自启..."

if [ "$PM2_INSTALLED" = true ]; then
  # PM2 进程守护 + 开机自启
  cd "$INSTALL_DIR"
  pm2 start src/index.ts --name synova-agent --interpreter tsx --node-args="--import tsx/esm" 2>/dev/null || \
    pm2 start npx --name synova-agent -- tsx src/index.ts

  # PM2 开机自启 (需要 sudo)
  if [ "$(id -u)" -eq 0 ] || sudo -n true 2>/dev/null; then
    pm2 startup systemd -u "$(whoami)" --hp "$HOME" 2>/dev/null || \
    pm2 startup launchd 2>/dev/null || \
    echo -e "${YELLOW}⚠️  开机自启配置失败 — 请手动运行: pm2 startup${NC}"
    pm2 save --force 2>/dev/null
    echo -e "${GREEN}✅ 开机自启已配置 (PM2 + systemd/launchd)${NC}"
  else
    echo -e "${YELLOW}⚠️  需要 sudo 权限配置开机自启。重启后手动运行: pm2 resurrect${NC}"
  fi

  # 显示 PM2 状态
  pm2 status 2>/dev/null || true
elif [ -d /etc/systemd/system ]; then
  # systemd fallback (Linux 裸机，无需 PM2)
  SYSTEMD_UNIT="/etc/systemd/system/synova-agent.service"
  if [ -w /etc/systemd/system ]; then
    cat > "$SYSTEMD_UNIT" << 'SYSTEMD_EOF'
[Unit]
Description=SynovaAgent — AI 组织诊断服务
After=network.target

[Service]
Type=simple
User=%u
WorkingDirectory=%h/.synova-agent
ExecStart=npx tsx src/index.ts
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SYSTEMD_EOF
    # 替换占位符
    sed -i "s|%u|$(whoami)|g; s|%h|$HOME|g" "$SYSTEMD_UNIT"
    systemctl daemon-reload
    systemctl enable synova-agent 2>/dev/null || true
    systemctl start synova-agent 2>/dev/null || true
    echo -e "${GREEN}✅ 开机自启已配置 (systemd)${NC}"
  else
    echo -e "${YELLOW}⚠️  无权限写入 /etc/systemd/system — 开机自启跳过${NC}"
    echo "  手动命令: nohup npx tsx src/index.ts > logs/synova.log 2>&1 &"
  fi
else
  # macOS launchd fallback
  PLIST="$HOME/Library/LaunchAgents/com.synova.agent.plist"
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.synova.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>npx</string><string>tsx</string><string>$INSTALL_DIR/src/index.ts</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>WorkingDirectory</key><string>$INSTALL_DIR</string>
  <key>EnvironmentVariables</key>
  <dict><key>PORT</key><string>3000</string></dict>
  <key>StandardOutPath</key><string>$INSTALL_DIR/logs/synova.log</string>
  <key>StandardErrorPath</key><string>$INSTALL_DIR/logs/synova.err</string>
</dict>
</plist>
PLIST_EOF
  launchctl load "$PLIST" 2>/dev/null || echo -e "${YELLOW}⚠️  launchd 加载失败 — 请手动: launchctl load $PLIST${NC}"
  echo -e "${GREEN}✅ 开机自启已配置 (launchd)${NC}"
fi

# ── 8. 完成 ──
echo ""
echo -e "${GREEN}${BOLD}✅ SynovaAgent 安装完成！${NC}"
echo ""
echo "  启动方式:"
if [ "$PM2_INSTALLED" = true ]; then
  echo -e "    ${CYAN}pm2 status${NC}          — 查看进程状态"
  echo -e "    ${CYAN}pm2 logs synova-agent${NC} — 查看日志"
  echo -e "    ${CYAN}pm2 restart synova-agent${NC} — 重启服务"
else
  echo -e "    ${CYAN}cd ${INSTALL_DIR} && npx tsx src/index.ts${NC}"
fi
echo ""
echo "  Web 界面:"
echo -e "    ${CYAN}http://localhost:3000${NC}"
echo ""
