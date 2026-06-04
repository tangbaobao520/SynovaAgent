# SynovaAgent PDE 一键部署脚本 (Windows PowerShell)
# 用途: PDE 在客户 Windows 机器上运行此脚本，自动完成环境配置。
# 用法: 右键 → "使用 PowerShell 运行" 或 .\scripts\setup.ps1
# 要求: 管理员权限（开机自启需要 Task Scheduler 写入权限）

param(
  [switch]$SkipPython = $false,
  [switch]$NoAutoStart = $false
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceDir = Split-Path -Parent $scriptDir

# ═══ 颜色 ═══
function Write-Step($msg) { Write-Host "`n── $msg ──" -ForegroundColor Cyan }
function Write-OK($msg)  { Write-Host "   ✅ $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "   ⚠️  $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "   ❌ $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "══════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  Synova 部署程序" -ForegroundColor Magenta
Write-Host "  组织数字孪生诊断 Agent — PDE 一键部署" -ForegroundColor Gray
Write-Host "══════════════════════════════════════════════" -ForegroundColor Magenta

# ═══ 1. 检查 Node.js ═══
Write-Step "1/7 检查 Node.js"
try {
  $nodeVersion = (node -v) -replace 'v',''
  $major = [int]($nodeVersion -split '\.')[0]
  if ($major -lt 20) {
    Write-Err "Node.js 版本过低 (当前: v$nodeVersion, 需要 >= 20)"
    Write-Host "   请安装: https://nodejs.org/en/download" -ForegroundColor Gray
    exit 1
  }
  Write-OK "Node.js v$nodeVersion"
} catch {
  Write-Err "未检测到 Node.js"
  Write-Host "   请安装: https://nodejs.org/en/download" -ForegroundColor Gray
  exit 1
}

# ═══ 2. 检查 Python (如果不需要可跳过) ═══
if (-not $SkipPython) {
  Write-Step "2/7 检查 Python"
  try {
    $pyVersion = (python --version 2>&1) -replace 'Python ',''
    $pyMajor = [int]($pyVersion -split '\.')[0]
    $pyMinor = [int]($pyVersion -split '\.')[1]
    if ($pyMajor -lt 3 -or ($pyMajor -eq 3 -and $pyMinor -lt 10)) {
      Write-Warn "Python 版本较低 (当前: $pyVersion, 建议 >= 3.10)"
    } else {
      Write-OK "Python $pyVersion"
    }
    Write-Step "2b/7 安装 Python 依赖"
    $reqFile = "$sourceDir\synova_worker\requirements.txt"
    if (Test-Path $reqFile) {
      pip install -r $reqFile --quiet 2>&1 | Out-Null
      Write-OK "Python 依赖已安装"
    } else {
      Write-Warn "未找到 requirements.txt，跳过"
    }
  } catch {
    Write-Warn "未检测到 Python — 飞书连接器将不可用"
    Write-Host "   如需使用连接器，请安装: https://python.org" -ForegroundColor Gray
  }
} else {
  Write-Step "2/7 跳过 Python 检查"
}

# ═══ 3. 确定安装目录 ═══
Write-Step "3/7 确定安装目录"
$installDir = if ($env:SYNOVA_HOME) { $env:SYNOVA_HOME } else { "$env:USERPROFILE\.synova-agent" }
Write-OK "安装目录: $installDir"

# ═══ 4. 安装 npm 依赖 ═══
Write-Step "4/7 安装 Node.js 依赖"
Set-Location $sourceDir
Write-Host "   npm install --omit=dev ... (可能需要 2-3 分钟)" -ForegroundColor Gray
npm install --omit=dev 2>&1 | Select-Object -Last 3
if ($LASTEXITCODE -ne 0) {
  Write-Err "npm install 失败"
  exit 1
}
Write-OK "Node.js 依赖已安装"

# ═══ 5. 配置飞书凭证 ═══
Write-Step "5/7 配置飞书凭证"
$envFile = "$installDir\.env"

# 只在文件不存在时提示配置
if (Test-Path $envFile) {
  Write-OK ".env 已存在 ($envFile)"
  Write-Host "   如需重新配置，请删除此文件后重新运行脚本" -ForegroundColor Gray
} else {
  Write-Host ""
  Write-Host "  配置飞书应用凭证 (从飞书开放平台获取):" -ForegroundColor Yellow
  Write-Host "  https://open.feishu.cn/app" -ForegroundColor Gray
  Write-Host ""

  $feishuAppId = Read-Host "  飞书 App ID"
  $feishuAppSecret = Read-Host "  飞书 App Secret" -AsSecureString
  $feishuTenant = Read-Host "  飞书租户 Key (回车跳过)"

  $plainSecret = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($feishuAppSecret)
  )

  # 写入 .env（仅含占位符说明，实际凭证走 CredentialVault 加密）
  @"
# SynovaAgent 环境配置
# 凭证由 CredentialVault (AES-256-GCM) 加密存储，本文件仅含非敏感配置

DEV_MODE=true
PORT=3000
FEISHU_APP_ID=$feishuAppId
FEISHU_TENANT=$feishuTenant
"@ | Out-File -FilePath $envFile -Encoding utf8

  # 将敏感凭证存入 CredentialVault (首次启动时自动加密)
  $credFile = "$installDir\data\.cred_init"
  New-Item -ItemType Directory -Force -Path "$installDir\data" | Out-Null
  @"
FEISHU_APP_SECRET=$plainSecret
"@ | Out-File -FilePath $credFile -Encoding utf8

  Write-OK "凭证已配置"
  Write-Host "   App Secret 将在首次启动时自动加密存储到 SQLite" -ForegroundColor Gray
  Write-Host "   完成后 $credFile 将被安全删除" -ForegroundColor Gray
}

# ═══ 6. 配置开机自启 ═══
if (-not $NoAutoStart) {
  Write-Step "6/7 配置开机自启"

  $taskName = "SynovaAgent"
  $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

  if ($existingTask) {
    Write-OK "开机自启已配置 (Task Scheduler: $taskName)"
  } else {
    try {
      # 创建启动脚本
      $startScript = "$installDir\start-synova.cmd"
      @"
@echo off
cd /d "$sourceDir"
start "" http://localhost:3000
npx tsx src/server.ts
"@ | Out-File -FilePath $startScript -Encoding ascii

      # 注册计划任务: 用户登录时启动
      $action = New-ScheduledTaskAction -Execute $startScript
      $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
      $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
      Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Synova-Agent 诊断服务" -Force | Out-Null

      Write-OK "开机自启已配置 (Task Scheduler: $taskName)"
    } catch {
      Write-Warn "开机自启配置失败 (可能需要管理员权限)"
      Write-Host "   手动配置: taskschd.msc → 创建任务 → 登录时运行 $startScript" -ForegroundColor Gray
    }
  }
} else {
  Write-Step "6/7 跳过开机自启 (--NoAutoStart)"
}

# ═══ 7. 启动服务 ═══
Write-Step "7/7 启动服务"
Write-Host "   正在启动 SynovaAgent ..." -ForegroundColor Gray

try {
  Start-Process "node" -ArgumentList "--require", "tsx/cjs", "$sourceDir\src\server.ts" -WindowStyle Hidden

  Start-Sleep -Seconds 3

  # 尝试打开浏览器
  try {
    $healthUrl = "http://localhost:3000/health"
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
      Write-OK "服务已启动 — http://localhost:3000"
      Start-Process "http://localhost:3000"
    }
  } catch {
    Write-Warn "服务可能还在启动中，请稍后访问 http://localhost:3000"
  }
} catch {
  Write-Warn "自动启动失败，请手动运行: npx tsx src/server.ts"
}

# ═══ 完成 ═══
Write-Host ""
Write-Host "══════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✅ SynovaAgent 部署完成！" -ForegroundColor Green
Write-Host "══════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  访问地址: http://localhost:3000" -ForegroundColor Cyan
Write-Host "  诊断 API: http://localhost:3000/api/diagnosis/consult" -ForegroundColor Cyan
Write-Host "  健康检查: http://localhost:3000/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "  下次开机时服务将自动启动。" -ForegroundColor Gray
Write-Host "  手动管理: taskschd.msc → SynovaAgent" -ForegroundColor Gray
Write-Host ""
