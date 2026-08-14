#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# install-backup-launchd.sh — D335 每日自动备份安装器（launchd, Mac）
#
# 背景: crontab 在这台 Mac 上被系统权限拦截（Operation not permitted），
#       这是 data/backups 停更于 08-09 的根因。launchd 用户级任务
#       （~/Library/LaunchAgents）无需 root、开机自启、系统原生，不依赖 crontab。
#
# 安装内容: 每天 03:30 跑 backup-db.sh → iCloud Drive 异地备份
# 用法: bash install-backup-launchd.sh
#       卸载: launchctl unload ~/Library/LaunchAgents/com.synova.backup-db.plist
# 退出码: 0 = 安装成功 / 1 = 失败
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/backup-db.sh"
PLIST="$HOME/Library/LaunchAgents/com.synova.backup-db.plist"
LABEL="com.synova.backup-db"

if [[ ! -f "$BACKUP_SCRIPT" ]]; then
  echo "❌ backup-db.sh 不存在: $BACKUP_SCRIPT"
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" 2>/dev/null || {
  echo "❌ LaunchAgents 目录不可创建"
  exit 1
}

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$BACKUP_SCRIPT</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>3</integer>
    <key>Minute</key>
    <integer>30</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/tmp/synova-backup-launchd.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/synova-backup-launchd.log</string>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
EOF

# 先卸载旧的（幂等重装）
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST" 2>/dev/null || {
  echo "❌ launchctl load 失败 — 请手动执行: launchctl load $PLIST"
  exit 1
}

echo "✅ 每日备份任务已安装:"
echo "   任务: $LABEL"
echo "   时间: 每天 03:30"
echo "   脚本: $BACKUP_SCRIPT"
echo "   日志: /tmp/synova-backup-launchd.log"
echo ""
echo "验证: launchctl list | grep synova.backup"
echo "手动跑一次: bash $BACKUP_SCRIPT"
echo "卸载: launchctl unload $PLIST"
exit 0
