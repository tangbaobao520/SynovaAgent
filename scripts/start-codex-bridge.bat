@echo off
REM Codex ↔ DeepSeek Bridge launcher
REM 密钥从 Windows 系统环境变量 LLM_API_KEY 读取, 不存放在仓库目录
cd /d %~dp0..
IF "%LLM_API_KEY%"=="" (
  echo [ERROR] LLM_API_KEY 系统环境变量未设置
  echo 请运行: powershell -Command "[Environment]::SetEnvironmentVariable('LLM_API_KEY', 'your-key', 'User')"
  echo 然后重新打开终端。
  pause
  exit /b 1
)

echo ======================================
echo  Codex ^<-> DeepSeek Bridge
echo  Port: 19199
echo  Target: api.deepseek.com/v1
echo  Key: %LLM_API_KEY:~0,8%...%LLM_API_KEY:~-4%
echo ======================================
echo.
echo Bridge running - leave this window open.
echo Open another terminal and run: codex
echo.

node .claude/codex-deepseek-bridge.mjs
pause
