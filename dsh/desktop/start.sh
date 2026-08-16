#!/usr/bin/env bash
# start.sh — 启动 Synova 控制塔桌面壳（macOS）
#
# 为什么用 `open`（LaunchServices）而不是直接 spawn：
#   从 DSH/VSCode 终端直接 spawn Electron 二进制会继承 VSCode coalition，
#   V8 初始化 SIGTRAP 崩溃（已在 2026-08-16 实测验证）。
#   `open` 让 LaunchServices 拉起应用，完全脱离该环境 → 正常。
#
# 用法: bash dsh/desktop/start.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$HERE/node_modules/electron/dist/Electron.app"

if [ ! -x "$APP/Contents/MacOS/Electron" ]; then
  echo "❌ Electron 未安装，先执行: cd $HERE && npm install"
  exit 1
fi

echo "== 启动 Synova 控制塔桌面壳 =="
echo "  应用: $APP"
echo "  指向: http://127.0.0.1:3080（已有 dsh web 则复用，否则自动拉起）"

# 临时把本壳注册为 Electron 的 app 入口（标准 Resources/app 机制），
# 用后即删，避免污染 node_modules 下的 Electron.app。
RES="$APP/Contents/Resources/app"
mkdir -p "$RES"
cp "$HERE/main.cjs" "$RES/main.cjs"
printf '{"name":"synova-dsh-desktop","main":"main.cjs"}' > "$RES/package.json"

open -n "$APP"

# 等待窗口进程稳定，再清理临时入口
sleep 5
rm -rf "$RES"

echo "✅ 已启动。Dock 中应出现 Electron 图标，窗口指向 DSH Web（含右侧三仪表盘）。"
echo "   （首次若提示未验证开发者，右键打开一次即可）"
