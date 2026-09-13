# run-1-install-journey.ps1 — D712 Win 侧「双击安装 → 启动 → 出窗 → 可诊断」计时实测
#
# 定位: 只生产机器证据，不修改被测代码（electron/ 与 scripts/install* 零触碰）。
# 路径: 双击 = Start-Process <installer> 不带 /S（nsis.oneClick=false → 打开安装向导，
#       双击 .exe 的物理行为与之一致）；向导页用 SendKeys 翻页（本机 CUA 原生 app 控制不可用）。
#       -SkipGuiWizard 时改用 /S 静默安装，与官方 scripts/desktop/win-install-verify.ps1 路径等价。
#
# 契约:
#   @input  -Installer <exe 路径> -OutDir <证据目录> [-SkipGuiWizard] [-KeepRunning]
#   @output <OutDir>/timing.json（里程碑 epoch ms + total_sec + verdict）+ transcript.log
#           + process.txt / window.txt / healthz.txt / backend.log / screenshot.png
#   @exit   0 = 里程碑全走完；1 = 任一里程碑失败（failed.txt 记失败步）；2 = 前置缺失
#   @degraded 每个失败步写 transcript + failed.txt（不静默——铁律 24）
param(
  [string]$Installer = 'D:\synova-desktop-Windows-200\SynovaAgent-0.1.0-win32-x64.exe',
  [string]$OutDir = $PSScriptRoot,
  [switch]$SkipGuiWizard,
  [switch]$KeepRunning,
  # 本会话是受限标准用户: %LOCALAPPDATA% / %APPDATA% 指向无权写入的 Administrator 配置文件
  # （New-Item 探针 Access denied）→ 默认 per-user 安装位不可写，NSIS 弹 "Run as" 提权框并永久挂起。
  # 这两个覆盖参数把安装位/userData 落到本会话可写目录，属环境适配而非改产品代码；证据 JSON 记录该偏差。
  [string]$InstallDirOverride = '',
  [string]$UserDataDir = ''
)
$ErrorActionPreference = 'Continue'
$APP_NAME = 'SynovaAgent'
$SERVER = 'http://localhost:18790'
$INSTALL_DIR = if ($InstallDirOverride) { $InstallDirOverride } else { Join-Path $env:LOCALAPPDATA "Programs\$APP_NAME" }
$APP_EXE = Join-Path $INSTALL_DIR "$APP_NAME.exe"
$USER_DATA = if ($UserDataDir) { $UserDataDir } else { Join-Path $env:APPDATA $APP_NAME }
$BACKEND_LOG = Join-Path $USER_DATA 'logs\backend.log'
$TARGET_SEC = 1800
$APP_ARGS = if ($UserDataDir) { @("--user-data-dir=$UserDataDir") } else { @() }

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$TRANSCRIPT = Join-Path $OutDir 'transcript.log'
function Log([string]$m) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss.fff'), $m
  Write-Host $line
  Add-Content -Path $TRANSCRIPT -Value $line -Encoding utf8
}
function NowMs { [int64](([datetime]::UtcNow - [datetime]'1970-01-01T00:00:00Z').TotalMilliseconds) }

Remove-Item $TRANSCRIPT -ErrorAction SilentlyContinue
$FAILURES = @()
$M = @{ install_start = $null; installer_window = $null; install_done = $null;
        app_launch = $null; window_ready = $null; healthz_200 = $null; first_diagnosis_ready = $null }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$wshell = New-Object -ComObject WScript.Shell

function Get-InstallerWindow {
  Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } |
    Where-Object { $_.MainWindowTitle -match 'Synova' -or $_.ProcessName -match 'Synova' } |
    Select-Object -First 1
}

function Save-Screenshot([string]$path) {
  try {
    $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Log "screenshot -> $path"
  } catch { Log "screenshot 失败: $($_.Exception.Message)" }
}

# ── ① 前置 ──
if (-not (Test-Path $Installer)) { Log "前置缺失: 安装包不存在 $Installer"; exit 2 }
if (Test-Path $INSTALL_DIR) { Log "前置缺失: $INSTALL_DIR 已存在（非净机态，先卸载）"; exit 2 }
$exeInfo = Get-Item $Installer
$exeMd5 = (Get-FileHash $Installer -Algorithm MD5).Hash
Log "① 前置 OK: $($exeInfo.Name) size=$($exeInfo.Length) md5=$exeMd5"
Log "   nsis.oneClick=false → 双击打开安装向导（本跑: $(if ($SkipGuiWizard) {'/S 静默'} else {'GUI 向导'}))"
if ($InstallDirOverride) { Log "   环境适配: 安装位覆盖 → $INSTALL_DIR（默认 %LOCALAPPDATA%\Programs\$APP_NAME 本会话不可写）" }
if ($UserDataDir) { Log "   环境适配: userData 覆盖 → $USER_DATA（--user-data-dir）" }
"$($exeInfo.Name)  $exeMd5  $($exeInfo.Length)" | Out-File (Join-Path $OutDir 'exe-md5.txt') -Encoding utf8

# ── ② 安装（T0 = 安装发起时刻） ──
$M.install_start = NowMs
Log "② install_start (T0) launch=$Installer $($(if ($SkipGuiWizard) {'/S'} else {''}))"
if ($SkipGuiWizard) {
  $instArgs = @('/S')
  if ($InstallDirOverride) { $instArgs += "/D=$InstallDirOverride" }   # NSIS: /D 必须最后且不加引号
  $inst = Start-Process $Installer -ArgumentList $instArgs -PassThru
} else {
  $inst = Start-Process $Installer -PassThru
}
Log "   installer pid=$($inst.Id) proc=$($inst.ProcessName)"

$installDeadline = (Get-Date).AddSeconds(180)
$wizardSeen = $false
$sentEnter = 0
while ((Get-Date) -lt $installDeadline) {
  if (Test-Path $APP_EXE) { break }
  if (-not $SkipGuiWizard) {
    $w = Get-InstallerWindow
    if ($w) {
      if (-not $wizardSeen) {
        $wizardSeen = $true; $M.installer_window = NowMs
        Log "   安装向导窗口: pid=$($w.Id) title=[$($w.MainWindowTitle)]"
      }
      # 向导页: Welcome → 安装目录 → Installing → Finish（runAfterFinish 默认勾选 → 启动 app）
      if ($sentEnter -lt 3) {
        try {
          [void]$wshell.AppActivate($w.Id); Start-Sleep -Milliseconds 400
          [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
          $sentEnter++
          Log "   向导翻页 Enter #$sentEnter (title=[$($w.MainWindowTitle)])"
          Start-Sleep -Milliseconds 900
        } catch { Log "   SendKeys 失败: $($_.Exception.Message)" }
      }
    }
  }
  Start-Sleep -Milliseconds 700
}

if (-not (Test-Path $APP_EXE)) {
  $FAILURES += 'install_done: 180s 内未出现 ' + $APP_EXE
  Log "② 失败: install_done —— $APP_EXE 未出现"
  (Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object Id, ProcessName, MainWindowTitle | Out-String) | Add-Content $TRANSCRIPT
} else {
  $M.install_done = NowMs
  Log "③ install_done: $APP_EXE"
}

# ── ③ 启动（GuiWizard 路径由安装器 Finish 页自动拉起；静默路径显式启动） ──
$launchDeadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $launchDeadline) {
  $p = Get-Process -Name $APP_NAME -ErrorAction SilentlyContinue
  if ($p) { break }
  if ($SkipGuiWizard -or -not (Test-Path $APP_EXE)) {
    if ((Test-Path $APP_EXE) -and -not $p -and -not $script:launched) {
      $script:launched = $true; Log "   静默路径: 显式启动 $APP_EXE $($APP_ARGS -join ' ')"; Start-Process $APP_EXE -ArgumentList $APP_ARGS | Out-Null
    }
  }
  Start-Sleep -Milliseconds 700
}
$p = Get-Process -Name $APP_NAME -ErrorAction SilentlyContinue
if (-not $p) {
  $FAILURES += 'app_launch: 未出现 SynovaAgent 进程'
  Log "③ 失败: app_launch —— 无 SynovaAgent 进程"
} else {
  $M.app_launch = NowMs
  Log "③ app_launch: pid=$(($p | Select-Object -ExpandProperty Id) -join ',')"
}

# ── ④ 出窗 ──
$winDeadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $winDeadline) {
  $p = Get-Process -Name $APP_NAME -ErrorAction SilentlyContinue
  $win = $p | Where-Object { $_.MainWindowHandle -ne 0 }
  if ($win) { break }
  Start-Sleep -Milliseconds 700
}
$p = Get-Process -Name $APP_NAME -ErrorAction SilentlyContinue
$win = $p | Where-Object { $_.MainWindowHandle -ne 0 }
if (-not $win) {
  $FAILURES += 'window_ready: MainWindowTitle/MainWindowHandle 为空'
  Log "④ 失败: window_ready"
} else {
  $M.window_ready = NowMs
  Log "④ window_ready: pid=$(($win | Select-Object -ExpandProperty Id) -join ',') title=[$(($win | Select-Object -ExpandProperty MainWindowTitle) -join '|')]"
}
Start-Sleep -Seconds 3
Save-Screenshot (Join-Path $OutDir 'screenshot.png')

# ── ⑤ 服务自启（healthz 200，全程零命令行起后端） ──
$hzDeadline = (Get-Date).AddSeconds(300)
$hzOk = $false
while ((Get-Date) -lt $hzDeadline) {
  try { if ((Invoke-WebRequest -UseBasicParsing "$SERVER/api/healthz" -TimeoutSec 3).StatusCode -eq 200) { $hzOk = $true; break } } catch {}
  Start-Sleep -Seconds 2
}
if ($hzOk) { $M.healthz_200 = NowMs; Log "⑤ healthz_200: $SERVER/api/healthz → 200（服务自启，未执行任何后端命令）" }
else { $FAILURES += 'healthz_200: 300s 内未达 200'; Log "⑤ 失败: healthz_200" }

# ── ⑥ 可诊断（consult 入口活着：400/401 即入口可达且校验在工作） ──
try {
  $ready = Invoke-WebRequest -UseBasicParsing -Method POST "$SERVER/api/diagnosis/consult" `
    -ContentType 'application/json' -Body '{"initiator":{"role":"ga"}}' -TimeoutSec 10
  $readyCode = [int]$ready.StatusCode
} catch {
  $readyCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
}
if ($readyCode -eq 400 -or $readyCode -eq 401) {
  $M.first_diagnosis_ready = NowMs
  Log "⑥ first_diagnosis_ready: consult 入口 HTTP $readyCode（预期 400/401 = 可提交）"
} else {
  $FAILURES += "first_diagnosis_ready: consult HTTP $readyCode（预期 400/401）"
  Log "⑥ 失败: first_diagnosis_ready —— HTTP $readyCode"
}

# ── ⑦ 证据落盘 ──
$p = Get-Process -Name $APP_NAME -ErrorAction SilentlyContinue
($p | Select-Object Id, ProcessName, SessionId, MainWindowHandle, MainWindowTitle, StartTime | Out-String) |
  Out-File (Join-Path $OutDir 'process.txt') -Encoding utf8
($win | Select-Object Id, ProcessName, MainWindowHandle, MainWindowTitle | Out-String) |
  Out-File (Join-Path $OutDir 'window.txt') -Encoding utf8
try { (Invoke-WebRequest -UseBasicParsing "$SERVER/api/healthz" -TimeoutSec 5 | Out-String) | Out-File (Join-Path $OutDir 'healthz.txt') -Encoding utf8 }
catch { "healthz 不可读: $($_.Exception.Message)" | Out-File (Join-Path $OutDir 'healthz.txt') -Encoding utf8 }
try { Copy-Item $BACKEND_LOG (Join-Path $OutDir 'backend.log') -ErrorAction Stop }
catch { "backend.log 不可读: $($_.Exception.Message)" | Out-File (Join-Path $OutDir 'backend.log') -Encoding utf8 }
# 后端进程树（证明服务是被 Electron 拉起的，而不是命令行起的）
(Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='SynovaAgent.exe'" -ErrorAction SilentlyContinue |
  Select-Object ProcessId, ParentProcessId, Name, CommandLine | Out-String) |
  Out-File (Join-Path $OutDir 'proctree.txt') -Encoding utf8

$startRef = if ($M.install_start) { $M.install_start } else { $M.app_launch }
$endRef = $M.first_diagnosis_ready
$totalSec = if ($startRef -and $endRef) { [math]::Round(($endRef - $startRef) / 1000.0, 1) } else { $null }
$verdict = if ($FAILURES.Count -gt 0) { 'FAILED' }
  elseif (-not $totalSec) { 'INCOMPLETE' }
  elseif ($totalSec -le $TARGET_SEC) { 'WITHIN_TARGET' } else { 'OVER_TARGET' }

$doc = [ordered]@{
  schema = 1
  record_type = 'first-diagnosis-timing'
  task = 'D712'
  generated_at = (Get-Date -Format o)
  mode = if ($SkipGuiWizard) { 'prod-silent' } else { 'prod-double-click' }
  installer = [ordered]@{ path = $Installer; md5 = $exeMd5; size = $exeInfo.Length; version = $exeInfo.VersionInfo.FileVersion }
  machine = [ordered]@{ host = $env:COMPUTERNAME; user = "$env:USERDOMAIN\$env:USERNAME"; session = (Get-Process -Id $PID).SessionId }
  accommodations = [ordered]@{
    install_dir_override = $InstallDirOverride
    user_data_dir = $UserDataDir
    reason = '本会话受限标准用户，%LOCALAPPDATA%/%APPDATA% 不可写（探针 Access denied）→ 默认 per-user 安装位触发 NSIS 提权框挂起'
  }
  milestones_ms = $M
  total_sec = $totalSec
  target_sec = $TARGET_SEC
  verdict = $verdict
  failures = $FAILURES
  note = '双击 = 无 /S 启动安装器（nsis.oneClick=false）；向导翻页用 SendKeys（本机 CUA 原生控制不可用）'
}
$doc | ConvertTo-Json -Depth 6 | Out-File (Join-Path $OutDir 'timing.json') -Encoding utf8
Log "⑦ evidence -> $OutDir ；total_sec=$totalSec verdict=$verdict failures=$(if($FAILURES.Count){$FAILURES -join '; '}else{'无'})"

if (-not $KeepRunning) {
  foreach ($pp in (Get-Process -Name $APP_NAME -ErrorAction SilentlyContinue)) {
    Stop-Process -Id $pp.Id -Force -ErrorAction SilentlyContinue
  }
  Log "⑧ 清理: Stop-Process 本实例（严禁 taskkill /IM node.exe——铁律 0-3）"
}
if ($FAILURES.Count -gt 0) { exit 1 }
exit 0
