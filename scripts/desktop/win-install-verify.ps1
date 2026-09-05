# scripts/desktop/win-install-verify.ps1 — Win 侧安装启动出窗四断言（切片 B D523）
#
# 契约（铁律 47）:
#   入口:  powershell.exe 5.1 与 pwsh 7 均可跑（D581 BOM 修复后两版均正确解析中文注释）:
#          powershell -File scripts/desktop/win-install-verify.ps1 [-DryRun] [-SkipInstall] [-KeepData]
#   出口:  exit 0 = 四断言全过（安装→启动→出窗→首诊后端健康）
#          exit 1 = 任一断言失败（evidence 记录失败步，不静默——铁律 24）
#          exit 2 = 前置缺失（切片 A D517 的 release/*.exe 不存在）→ waiting，不伪造实测（DS4）
#   断言:  A 进程（Get-Process -Name SynovaAgent）
#          B 窗口（MainWindowTitle 非空）
#          C healthz（Invoke-WebRequest http://localhost:18790/api/healthz → 200）
#          D 后端日志（userData logs/backend.log 非空）
#   红线:  严禁 taskkill /IM node.exe（铁律 0-3——会杀所有 Node 进程）；清理只 Stop-Process 本实例 pid。
#          严禁伪造 evidence（D510 F1 / DS4）。
param(
  [switch]$DryRun,      # 只打印步骤不断言
  [switch]$SkipInstall, # 已安装则跳过安装步
  [switch]$KeepData     # 清理时保留 userData
)
$ErrorActionPreference = 'Stop'
$SERVER = 'http://localhost:18790'
$APP_NAME = 'SynovaAgent'
$REPO_ROOT = Split-Path -Parent $PSScriptRoot | Split-Path -Parent
$EXE_DIR = Join-Path $REPO_ROOT 'release'
# D581 证据路径: 落 git 跟踪目录（CT-57 口径: 断言摘要/md5 入 git，1-2 兑换证据链）。
# 根级 evidence/ 被 .gitignore:76 禁用（K3 P1-1 同型）；本目录靠 .gitignore 豁免行
# `!docs/synova/product-lines/evidence/` 保持非忽略，evidence 文件 git add 无需 -f。
$EVIDENCE_DIR = Join-Path $REPO_ROOT 'docs/synova/product-lines/evidence/D578-win-real-machine'
$INSTALL_DIR = Join-Path $env:LOCALAPPDATA "Programs\$APP_NAME"
$USER_DATA = Join-Path $env:APPDATA $APP_NAME

function Write-Step { param($msg) Write-Host "[win-install-verify] $msg" }

# ① 前置检查: 切片 A D517 产物 release/*.exe 存在 + md5 落 evidence（无则 exit 2 waiting，不伪造）
# P1-1 修复: 本分支禁用 Write-Error——$ErrorActionPreference='Stop' 下 Write-Error 抛终止错误，
#            后续 exit 2 不可达（实际退出码 1）。waiting 是受控状态非错误 → Write-Host + 显式 exit 2。
$exe = Get-ChildItem $EXE_DIR -Filter '*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $exe) {
  Write-Host "[win-install-verify] waiting: 切片 A D517 .exe 缺失（$EXE_DIR 无产物）——D523 物理实测进 waiting，不伪造（DS4）"
  exit 2
}
New-Item -ItemType Directory -Force -Path $EVIDENCE_DIR | Out-Null
$md5 = (Get-FileHash $exe.FullName -Algorithm MD5).Hash
"$($exe.Name)  $md5" | Out-File (Join-Path $EVIDENCE_DIR 'exe-md5.txt') -Encoding utf8
Write-Step "① 前置 OK: $($exe.Name) md5=$md5"

if ($DryRun) {
  Write-Step "DryRun: ② NSIS 静默安装 ③ 启动 $APP_NAME ④ 四断言 ⑤ evidence ⑥ 清理 —— 只打印不执行"
  exit 0
}

# ② 安装: NSIS 静默（/S）；交互态双击安装留 founder-demo-win.md 第 1 步
if (-not $SkipInstall) {
  Write-Step "② 安装: $($exe.FullName) /S"
  Start-Process $exe.FullName -ArgumentList '/S' -Wait
}

# ③ 启动: 从安装目录启动（快捷方式等价——同一 exe）
$app = Join-Path $INSTALL_DIR "$APP_NAME.exe"
if (-not (Test-Path $app)) {
  "$app 不存在（安装失败）" | Out-File (Join-Path $EVIDENCE_DIR 'failed.txt') -Encoding utf8
  Write-Host "[win-install-verify] 断言失败: 安装目录无 $APP_NAME.exe（evidence/failed.txt 已记录）" # P1-1: EAP=Stop 下错误型输出会吞掉显式 exit，故用 Write-Host
  exit 1
}
Write-Step "③ 启动: $app"
$proc = Start-Process $app -PassThru

# ④ 轮询 60s 四断言（任一失败 → exit 1 + evidence 记录失败步，不静默）
$deadline = (Get-Date).AddSeconds(60)
$failStep = $null
while ((Get-Date) -lt $deadline) {
  $p = Get-Process -Name $APP_NAME -ErrorAction SilentlyContinue
  $win = $p | Where-Object { $_.MainWindowTitle -ne '' }
  $hzOk = $false
  try { $hzOk = ((Invoke-WebRequest -UseBasicParsing "$SERVER/api/healthz" -TimeoutSec 3).StatusCode -eq 200) } catch { $hzOk = $false }
  $logOk = (Test-Path (Join-Path $USER_DATA 'logs/backend.log')) -and ((Get-Item (Join-Path $USER_DATA 'logs/backend.log') -ErrorAction SilentlyContinue).Length -gt 0)
  if ($p -and $win -and $hzOk -and $logOk) { break }
  Start-Sleep -Seconds 2
}
# ⑤ evidence 落盘（五类证据原文）
$p | Out-File (Join-Path $EVIDENCE_DIR 'process.txt') -Encoding utf8
$win | Out-File (Join-Path $EVIDENCE_DIR 'window.txt') -Encoding utf8
try { (Invoke-WebRequest -UseBasicParsing "$SERVER/api/healthz" -TimeoutSec 5) | Out-File (Join-Path $EVIDENCE_DIR 'healthz.txt') -Encoding utf8 } catch { $_.Exception.Message | Out-File (Join-Path $EVIDENCE_DIR 'healthz.txt') -Encoding utf8 }
try { Copy-Item (Join-Path $USER_DATA 'logs/backend.log') (Join-Path $EVIDENCE_DIR 'backend.log') -ErrorAction Stop } catch { "backend.log 不可读: $($_.Exception.Message)" | Out-File (Join-Path $EVIDENCE_DIR 'backend.log') -Encoding utf8 }
if (-not $p) { $failStep = 'A 进程: Get-Process SynovaAgent 无结果' }
elseif (-not $win) { $failStep = 'B 窗口: MainWindowTitle 为空' }
elseif (-not $hzOk) { $failStep = "C healthz: $SERVER/api/healthz 未达 200" }
elseif (-not $logOk) { $failStep = 'D 后端日志: userData logs/backend.log 为空/缺失' }

# ⑥ 清理: 只杀本实例 pid（严禁 taskkill /IM node.exe——铁律 0-3）+ 静默卸载
if ($failStep) {
  Write-Host "[win-install-verify] 断言失败: $failStep（evidence 已落 $EVIDENCE_DIR）" # P1-1: EAP=Stop 下错误型输出会跳过清理与显式 exit，故用 Write-Host
  $failStep | Out-File (Join-Path $EVIDENCE_DIR 'failed.txt') -Encoding utf8
}
foreach ($pp in (Get-Process -Name $APP_NAME -ErrorAction SilentlyContinue)) { Stop-Process -Id $pp.Id -Force -ErrorAction SilentlyContinue }
$uninstaller = Join-Path $INSTALL_DIR 'Uninstall SynovaAgent.exe'
if ((-not $KeepData) -and (Test-Path $uninstaller)) { Start-Process $uninstaller -ArgumentList '/S' -Wait }
if ($failStep) { exit 1 }
Write-Step "④ 四断言全过（进程+窗口+healthz+日志）；⑤ evidence: $EVIDENCE_DIR；⑥ 清理完成"
exit 0
