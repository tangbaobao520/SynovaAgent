# SynovaAgent 一键安装脚本 (Windows PowerShell)
# 用法: iwr -useb https://raw.githubusercontent.com/.../install.ps1 | iex

Write-Host ""
Write-Host "  SynovaAgent 安装程序" -ForegroundColor Cyan
Write-Host "  组织数字孪生诊断 Agent" -ForegroundColor Gray
Write-Host ""

# ── 1. 检查 Node.js ──
try {
  $nodeVersion = (node -v) -replace 'v', ''
  $major = [int]($nodeVersion -split '\.')[0]
  if ($major -lt 20) {
    Write-Host "❌ Node.js 版本过低 (当前: $(node -v), 需要 >= 20)" -ForegroundColor Red
    exit 1
  }
  Write-Host "✅ Node.js $(node -v)" -ForegroundColor Green
} catch {
  Write-Host "❌ 未检测到 Node.js。请安装: https://nodejs.org" -ForegroundColor Red
  exit 1
}

# ── 2. 检查 npm ──
try {
  Write-Host "✅ npm $(npm -v)" -ForegroundColor Green
} catch {
  Write-Host "❌ 未检测到 npm" -ForegroundColor Red
  exit 1
}

# ── 3. 安装目录 ──
$installDir = if ($env:SYNOVA_HOME) { $env:SYNOVA_HOME } else { "$env:USERPROFILE\.synova-agent" }
Write-Host ""
Write-Host "安装目录: $installDir" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceDir = Split-Path -Parent $scriptDir

if (-not (Test-Path "$sourceDir\package.json")) {
  Write-Host "⚠️  请先 clone 项目，然后从项目目录运行: .\scripts\install.ps1" -ForegroundColor Yellow
  exit 1
}

# ── 4. 复制文件 ──
Write-Host "复制文件..."
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Copy-Item -Recurse -Force "$sourceDir\*" $installDir

# ── 5. 安装依赖 ──
Set-Location $installDir
Write-Host "安装依赖..."
npm install --omit=dev 2>&1 | Select-Object -Last 5

# ── 6. 创建数据目录 ──
New-Item -ItemType Directory -Force -Path "$installDir\data" | Out-Null

# ── 7. 完成 ──
Write-Host ""
Write-Host "✅ SynovaAgent 安装完成！" -ForegroundColor Green
Write-Host ""
Write-Host "  启动 Web 服务:"
Write-Host "    cd $installDir; node dist/index.js" -ForegroundColor Cyan
Write-Host ""
Write-Host "  对话模式:"
Write-Host "    npx tsx src/cli.ts" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Web 界面: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
