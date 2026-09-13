# run-2-installed-app-runtime.ps1 — D712 Win 侧「服务自启、开窗即用 + 启动到可诊断计时」
#
# 定位: 1-2 的安装段在本会话被 NSIS 提权框阻塞（见 run-A/run-C 证据），本脚本用**已经装好的应用目录**
#       （D578 会话落盘的 NSIS 安装产物，含 Uninstall SynovaAgent.exe）验证其后半段：
#       只做「启动 app」这一个创始人动作 → 后端自启 → 出窗 → healthz → consult 入口可达。
#       不修改被测代码（electron/ 与 scripts/install* 零触碰）。
#
# 契约:
#   @input  -AppExe <安装目录 SynovaAgent.exe> -UserDataDir <可写 userData> -OutDir <证据目录> [-KeepRunning]
#   @output timing.json（app_launch/healthz_200/first_diagnosis_ready 里程碑）+ transcript.log
#           + pre-node.txt / post-node.txt（自启前后 node 进程差集 = 自启证据）+ window.txt / healthz.txt / backend.log
#   @exit   0 = 里程碑全走完；1 = 任一断言失败（failed.txt 记失败步）；2 = 前置缺失
#   @degraded 失败步写 transcript + failed.txt（不静默——铁律 24）
param(
  [Parameter(Mandatory = $true)][string]$AppExe,
  [Parameter(Mandatory = $true)][string]$UserDataDir,
  [string]$OutDir = $PSScriptRoot,
  [switch]$KeepRunning,
  # 本会话的桌面是私有沙箱桌面（CodexSandboxDesktop-*），Chromium 沙箱起不来：
  # 不带 --no-sandbox 时主进程 exit=0x80000003 且无窗；带 --no-sandbox 才出窗。
  # 这是**环境适配**，证据 JSON 如实记录（不改产品代码）。
  [string[]]$ExtraAppArgs = @()
)
$ErrorActionPreference = 'Continue'
$APP_NAME = 'SynovaAgent'
$SERVER = 'http://localhost:18790'
$TARGET_SEC = 1800

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
New-Item -ItemType Directory -Force -Path $UserDataDir | Out-Null
$TRANSCRIPT = Join-Path $OutDir 'transcript.log'
function Log([string]$m) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss.fff'), $m
  Write-Host $line
  Add-Content -Path $TRANSCRIPT -Value $line -Encoding utf8
}
function NowMs { [int64](([datetime]::UtcNow - [datetime]'1970-01-01T00:00:00Z').TotalMilliseconds) }
function NodePids { @(Get-Process -Name node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id) -join ',' }

Remove-Item $TRANSCRIPT -ErrorAction SilentlyContinue
$FAILURES = @()
$M = @{ app_launch = $null; window_ready = $null; healthz_200 = $null; first_diagnosis_ready = $null }
$APP_ARGS = @($ExtraAppArgs) + @("--user-data-dir=$UserDataDir")

# ── ① 前置 ──
if (-not (Test-Path $AppExe)) { Log "前置缺失: $AppExe"; exit 2 }
if (Get-Process -Name $APP_NAME -ErrorAction SilentlyContinue) { Log "前置缺失: 已有 $APP_NAME 进程在跑（需净态）"; exit 2 }
$preNode = NodePids
$preListen = @(Get-NetTCPConnection -LocalPort 18790 -State Listen -ErrorAction SilentlyContinue).Count
Log "① 前置 OK: app=$AppExe"
Log "   启动前 node pids=[$preNode] ; 18790 listeners=$preListen"
if ($preListen -gt 0) { $FAILURES += 'precondition: 18790 已被占用（非净态）'; Log "   失败: 18790 已占用" }
$ai = Get-Item $AppExe
"$($ai.FullName)`nmd5=$((Get-FileHash $AppExe -Algorithm MD5).Hash)`nsize=$($ai.Length)`nversion=$($ai.VersionInfo.FileVersion)" |
  Out-File (Join-Path $OutDir 'app-exe.txt') -Encoding utf8
"pre_node_pids=$preNode" | Out-File (Join-Path $OutDir 'pre-node.txt') -Encoding utf8

# ── ② 创始人唯一动作: 启动 app（不起任何后端命令） ──
$M.app_launch = NowMs
Log "② app_launch (T0): $AppExe $($APP_ARGS -join ' ')"
Log "   唯一动作 = 启动桌面应用；未执行任何后端/npm/node 命令（服务自启断言前提）"
$APP_STDERR = Join-Path $OutDir 'app-stderr.log'
$APP_STDOUT = Join-Path $OutDir 'app-stdout.log'
Remove-Item $APP_STDERR, $APP_STDOUT -ErrorAction SilentlyContinue
$env:ELECTRON_ENABLE_LOGGING = '1'
$launched = Start-Process $AppExe -ArgumentList $APP_ARGS -PassThru `
  -RedirectStandardError $APP_STDERR -RedirectStandardOutput $APP_STDOUT
Log "   主进程 pid=$($launched.Id)"

# ── ③ 出窗 ──
$deadline = (Get-Date).AddSeconds(180)
$win = $null
while ((Get-Date) -lt $deadline) {
  $p = Get-Process -Name $APP_NAME -ErrorAction SilentlyContinue
  $win = $p | Where-Object { $_.MainWindowHandle -ne 0 }
  if ($win) { break }
  Start-Sleep -Milliseconds 700
}
if (-not $win) {
  $FAILURES += 'window_ready: 180s 内无可见主窗口'
  Log "③ 失败: window_ready"
} else {
  $M.window_ready = NowMs
  Log "③ window_ready: pid=$(($win | Select-Object -ExpandProperty Id) -join ',') title=[$(($win | Select-Object -ExpandProperty MainWindowTitle) -join '|')] handle=$(($win | Select-Object -ExpandProperty MainWindowHandle) -join ',')"
}

# ── ④ 服务自启（healthz 200） ──
$hzDeadline = (Get-Date).AddSeconds(300)
$hzOk = $false
while ((Get-Date) -lt $hzDeadline) {
  try { if ((Invoke-WebRequest -UseBasicParsing "$SERVER/api/healthz" -TimeoutSec 3).StatusCode -eq 200) { $hzOk = $true; break } } catch {}
  Start-Sleep -Seconds 2
}
if ($hzOk) { $M.healthz_200 = NowMs; Log "④ healthz_200: $SERVER/api/healthz → 200" }
else { $FAILURES += 'healthz_200: 300s 内未达 200（服务未自启）'; Log "④ 失败: healthz_200" }

# ── ⑤ 可诊断（consult 入口 400/401 = 入口活着且校验在工作） ──
try {
  $r = Invoke-WebRequest -UseBasicParsing -Method POST "$SERVER/api/diagnosis/consult" `
    -ContentType 'application/json' -Body '{"initiator":{"role":"ga"}}' -TimeoutSec 15
  $readyCode = [int]$r.StatusCode
} catch {
  $readyCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
}
if ($readyCode -eq 400 -or $readyCode -eq 401) {
  $M.first_diagnosis_ready = NowMs
  Log "⑤ first_diagnosis_ready: consult HTTP $readyCode（可提交）"
} else {
  $FAILURES += "first_diagnosis_ready: consult HTTP $readyCode（预期 400/401）"
  Log "⑤ 失败: first_diagnosis_ready —— HTTP $readyCode"
}

# ── ⑥ 自启证据: node 进程差集 + 日志 ──
$postNode = NodePids
$preArr = @($preNode -split ',' | Where-Object { $_ })
$newNode = @($postNode -split ',' | Where-Object { $_ -and ($preArr -notcontains $_) })
Log "⑥ 启动后 node pids=[$postNode]；新增=[$($newNode -join ',')]（数量 $($newNode.Count)）"

$p = Get-Process -Name $APP_NAME -ErrorAction SilentlyContinue
"post_node_pids=$postNode`nnew_node_pids=$($newNode -join ',')`nnew_count=$($newNode.Count)" |
  Out-File (Join-Path $OutDir 'post-node.txt') -Encoding utf8
($p | Select-Object Id, ProcessName, SessionId, MainWindowHandle, MainWindowTitle, StartTime, Path | Out-String) |
  Out-File (Join-Path $OutDir 'process.txt') -Encoding utf8
($win | Select-Object Id, ProcessName, MainWindowHandle, MainWindowTitle | Out-String) |
  Out-File (Join-Path $OutDir 'window.txt') -Encoding utf8
try { (Invoke-WebRequest -UseBasicParsing "$SERVER/api/healthz" -TimeoutSec 5 | Out-String) | Out-File (Join-Path $OutDir 'healthz.txt') -Encoding utf8 }
catch { "healthz 不可读: $($_.Exception.Message)" | Out-File (Join-Path $OutDir 'healthz.txt') -Encoding utf8 }
$blog = Join-Path $UserDataDir 'logs\backend.log'
try { Copy-Item $blog (Join-Path $OutDir 'backend.log') -ErrorAction Stop; Log "   backend.log 已复制（$((Get-Item $blog).Length) bytes）" }
catch { "backend.log 不可读: $($_.Exception.Message)" | Out-File (Join-Path $OutDir 'backend.log') -Encoding utf8; Log "   backend.log 不可读: $($_.Exception.Message)" }
$db = Join-Path $UserDataDir 'data\synova.db'
"db_exists=$(Test-Path $db) path=$db" | Out-File (Join-Path $OutDir 'db-state.txt') -Encoding utf8

$startRef = $M.app_launch; $endRef = $M.first_diagnosis_ready
$totalSec = if ($startRef -and $endRef) { [math]::Round(($endRef - $startRef) / 1000.0, 1) } else { $null }
$verdict = if ($FAILURES.Count -gt 0) { 'FAILED' }
  elseif (-not $totalSec) { 'INCOMPLETE' }
  elseif ($totalSec -le $TARGET_SEC) { 'WITHIN_TARGET' } else { 'OVER_TARGET' }
[ordered]@{
  schema = 1; record_type = 'first-diagnosis-timing'; task = 'D712'
  generated_at = (Get-Date -Format o)
  segment = 'app_launch_to_first_diagnosis_ready（安装段被提权框阻塞，本段不含安装耗时）'
  app_exe = $AppExe; app_md5 = (Get-FileHash $AppExe -Algorithm MD5).Hash
  user_data_dir = $UserDataDir
  app_args = ($APP_ARGS -join ' ')
  app_exit_code = $(if ($launched.HasExited) { $launched.ExitCode } else { 'running' })
  machine = [ordered]@{ host = $env:COMPUTERNAME; user = "$env:USERDOMAIN\$env:USERNAME"; session = (Get-Process -Id $PID).SessionId }
  accommodations = [ordered]@{
    extra_app_args = ($ExtraAppArgs -join ' ')
    app_path = $AppExe
    reason = '会话桌面为私有沙箱桌面（CodexSandboxDesktop-*）：Chromium 沙箱初始化失败（exit 0x80000003 且无窗）；--no-sandbox + 非 8.3 短路径 才可出窗'
  }
  milestones_ms = $M; total_sec = $totalSec; target_sec = $TARGET_SEC
  verdict = $verdict; failures = $FAILURES
  self_start = [ordered]@{ pre_node_pids = $preNode; post_node_pids = $postNode; new_node_pids = ($newNode -join ','); new_count = $newNode.Count }
  note = '启动动作只有 Start-Process <app exe>；未执行任何后端命令 → 新增 node = Electron 自启（D504 ensureBackend）'
} | ConvertTo-Json -Depth 6 | Out-File (Join-Path $OutDir 'timing.json') -Encoding utf8
Log "⑦ evidence -> $OutDir ；total_sec=$totalSec verdict=$verdict failures=$(if($FAILURES.Count){$FAILURES -join '; '}else{'无'})"

if (-not $KeepRunning) {
  foreach ($pp in (Get-Process -Name $APP_NAME -ErrorAction SilentlyContinue)) { Stop-Process -Id $pp.Id -Force -ErrorAction SilentlyContinue }
  foreach ($nid in $newNode) { Stop-Process -Id ([int]$nid) -Force -ErrorAction SilentlyContinue }
  Log "⑧ 清理: 只停本实例 pid（严禁 taskkill /IM node.exe——铁律 0-3）"
}
if ($FAILURES.Count -gt 0) { exit 1 }
exit 0
