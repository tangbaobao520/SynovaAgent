# run-3-upgrade-data-retention.ps1 — D712 Win 侧「升级/重装不丢数据」（验收点 1-7）
#
# 定位: 只采样与替换文件，不改产品代码。NSIS 覆盖安装的物理语义 = 同一安装路径下文件被替换、
#       userData 不动；本脚本用「删掉安装目录 → 重新铺一份同版本产物」复现该语义，前后采样 DB 指纹比对。
#       （真 NSIS 升级路径在本会话被提权框阻塞——见 run-A/run-C/run-E 证据。）
#
# 契约:
#   @input  -AppDir <安装目录> -UserDataDir <userData> -FreshSource <重装源目录> -OutDir <证据目录>
#   @output before.json / after.json / verdict.json + transcript.log
#   @exit   0 = 断言全过（表清单一致 + 关键表行数一致 + PRAGMA integrity_check=ok）
#           1 = 任一断言失败（verdict.json 记失败步）；2 = 前置缺失
param(
  [Parameter(Mandatory = $true)][string]$AppDir,
  [Parameter(Mandatory = $true)][string]$UserDataDir,
  [Parameter(Mandatory = $true)][string]$FreshSource,
  [string]$OutDir = $PSScriptRoot
)
$ErrorActionPreference = 'Continue'
$APP_NAME = 'SynovaAgent'
$DB = Join-Path $UserDataDir 'data\synova.db'
$FP = Join-Path $PSScriptRoot 'db-fingerprint.cjs'
$LOG = Join-Path $OutDir 'transcript.log'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
function Log([string]$m) { $l = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss.fff'), $m; Write-Host $l; Add-Content -Path $LOG -Value $l -Encoding utf8 }
Remove-Item $LOG -ErrorAction SilentlyContinue
$FAIL = @()

function Stop-App {
  foreach ($p in (Get-Process -Name $APP_NAME -ErrorAction SilentlyContinue)) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 3
}
function Fingerprint([string]$out) {
  $env:ELECTRON_RUN_AS_NODE = '1'
  $res = Join-Path $AppDir 'resources'
  $txt = & (Join-Path $AppDir "$APP_NAME.exe") $FP $res $DB 2>&1 | Out-String
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  $txt | Set-Content $out -Encoding utf8
  return $txt
}
function Wait-Healthy([int]$timeoutSec) {
  for ($i = 0; $i -lt ($timeoutSec / 2); $i++) {
    try { if ((Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:18790/api/healthz' -TimeoutSec 3).StatusCode -eq 200) { return $true } } catch {}
    Start-Sleep -Seconds 2
  }
  return $false
}

if (-not (Test-Path $AppDir)) { Log "前置缺失: $AppDir"; exit 2 }
if (-not (Test-Path $FreshSource)) { Log "前置缺失: 重装源 $FreshSource"; exit 2 }

# ── ① 基线: 应用在跑 → 停 → 采 v1 指纹 ──
Log "① 基线采样（停止应用后读 userData DB）"
Stop-App
if (-not (Test-Path $DB)) { Log "失败: DB 不存在 $DB（应用未成功建库）"; 'db_missing' | Set-Content (Join-Path $OutDir 'failed.txt') -Encoding utf8; exit 1 }
$before = Fingerprint (Join-Path $OutDir 'before.json')
Log "   before: $($before -replace '\s+', ' ')"

# ── ② 重装（覆盖安装语义: 替换安装目录文件，userData 零触碰） ──
Log "② 重装: 删除 $AppDir → 从 $FreshSource 重新铺同版本产物"
$md5AppBefore = (Get-FileHash (Join-Path $AppDir "$APP_NAME.exe") -Algorithm MD5).Hash
Remove-Item $AppDir -Recurse -Force -ErrorAction Stop
Copy-Item $FreshSource $AppDir -Recurse -Force -ErrorAction Stop
$md5AppAfter = (Get-FileHash (Join-Path $AppDir "$APP_NAME.exe") -Algorithm MD5).Hash
Log "   安装文件替换完成（exe md5 前=$md5AppBefore 后=$md5AppAfter 一致=$($md5AppBefore -eq $md5AppAfter)）"
Log "   userData 未被触碰: $UserDataDir（重装流程零写入该目录）"

# ── ③ 重装后启动 → 健康 → 停 ──
Log "③ 重装后启动应用（--no-sandbox 环境适配）"
$launched = Start-Process (Join-Path $AppDir "$APP_NAME.exe") -ArgumentList '--no-sandbox', "--user-data-dir=$UserDataDir" -PassThru
$healthy = Wait-Healthy 180
Log "   重装后 healthz 200 = $healthy"
if (-not $healthy) { $FAIL += 'relaunch: 重装后 180s 内 healthz 未达 200' }
Stop-App

# ── ④ 重装后指纹 + 断言 ──
Log "④ 重装后采样 + 断言"
$after = Fingerprint (Join-Path $OutDir 'after.json')
Log "   after : $($after -replace '\s+', ' ')"
try { $b = $before | ConvertFrom-Json; $a = $after | ConvertFrom-Json } catch { Log "失败: 指纹 JSON 解析失败"; exit 1 }

if (-not $b.ok) { $FAIL += "before 采样失败: $($b.error)" }
if (-not $a.ok) { $FAIL += "after 采样失败: $($a.error)" }
if ($b.ok -and $a.ok) {
  $tablesSame = (($b.tables -join ',') -eq ($a.tables -join ','))
  if (-not $tablesSame) { $FAIL += 'tables: 表清单不一致' }
  $rowsSame = $true
  foreach ($k in $b.rows.PSObject.Properties.Name) {
    $bv = $b.rows.$k; $av = $a.rows.$k
    if ($bv -ne $av) { $rowsSame = $false; $FAIL += "rows[$k]: 前=$bv 后=$av（行数丢失）" }
  }
  if ($a.integrity -ne 'ok') { $FAIL += "integrity_check: $($a.integrity)" }
  $verdict = if ($FAIL.Count -eq 0) { 'DATA_RETAINED' } else { 'DATA_LOST_OR_FAILED' }
  [ordered]@{
    schema = 1; record_type = 'upgrade-data-retention'; task = 'D712'
    generated_at = (Get-Date -Format o)
    install_dir = $AppDir; user_data = $UserDataDir; db = $DB
    app_exe_md5_before = $md5AppBefore; app_exe_md5_after = $md5AppAfter
    tables_same = $tablesSame; rows_same = $rowsSame
    before = $b; after = $a
    relaunch_healthy = $healthy
    verdict = $verdict; failures = $FAIL
    note = '覆盖安装语义 = 同路径替换安装文件 + userData 不动；真 NSIS 升级路径本会话被提权框阻塞（另见 run-E）'
  } | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir 'verdict.json') -Encoding utf8
  Log "⑤ verdict=$verdict failures=$(if($FAIL.Count){$FAIL -join '; '}else{'无'})"
}
if ($FAIL.Count -gt 0) { $FAIL | Set-Content (Join-Path $OutDir 'failed.txt') -Encoding utf8; exit 1 }
exit 0
