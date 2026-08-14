# Add SynovaAgent to user PATH (run once)
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$current = [Environment]::GetEnvironmentVariable("Path", "User")
if ($current -notlike "*$dir*") {
    [Environment]::SetEnvironmentVariable("Path", "$current;$dir", "User")
    Write-Host "SynovaAgent added to PATH. Restart terminal, then type: synova" -ForegroundColor Green
} else {
    Write-Host "SynovaAgent already in PATH" -ForegroundColor Green
}
