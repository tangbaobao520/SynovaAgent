@echo off
REM Codex <-> DeepSeek Bridge (v2 — 非流式 JSON 响应)
REM 用法: 双击运行，保持窗口打开。然后在另一个终端运行 codex
REM 密钥从 Windows 系统环境变量 LLM_API_KEY 读取

cd /d "D:\codex\.codex"

IF "%LLM_API_KEY%"=="" (
  echo [ERROR] LLM_API_KEY 系统环境变量未设置
  echo 请运行: powershell -Command "[Environment]::SetEnvironmentVariable('LLM_API_KEY', 'your-key', 'User')"
  echo 然后重新打开终端。
  pause
  exit /b 1
)

echo ======================================
echo  Codex ^<-> DeepSeek Bridge v2
echo  Port: 19199
echo  Target: api.deepseek.com/v1
echo  Key: %LLM_API_KEY:~0,8%...%LLM_API_KEY:~-4%
echo ======================================
echo.
echo Bridge running - leave this window open.
echo Open another terminal and run: codex
echo.

node deepseek-bridge.mjs
pause
