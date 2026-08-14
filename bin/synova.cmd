@echo off
REM Synova 增长导航系统 — Windows 启动脚本
cd /d "%~dp0\.."
npx tsx src/tui/chat.ts %*
