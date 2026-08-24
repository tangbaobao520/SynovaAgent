# Founder Demo — Windows 双击安装启动出窗（D523，D510 遗留 DS11 Win 半边）

> 目标：创始人在 Windows 电脑上零命令行验证「双击安装 → 启动 → 出窗 → 首诊页可达」。
> 一键实跑：`powershell -File scripts/desktop/win-install-verify.ps1`（exit 0 = 全过）。
> 前置：切片 A D517 的 `release/*.exe` 存在（缺失则脚本 exit 2 = waiting，不伪造）。

## 第 1 步 安装

| 项 | 内容 |
|---|---|
| 命令 | 双击 `release\*.exe`（或脚本 `Start-Process <exe> /S` 静默装） |
| 预期 | `%LOCALAPPDATA%\Programs\SynovaAgent\SynovaAgent.exe` 出现 + 开始菜单/桌面快捷方式 |
| 证据落点 | `evidence/D523-win-<date>/exe-md5.txt`（`Get-FileHash <exe> -Algorithm MD5`）→ task-state.evidence.exe_md5 |

## 第 2 步 启动

| 项 | 内容 |
|---|---|
| 命令 | 双击快捷方式（或 `Start-Process "$env:LOCALAPPDATA\Programs\SynovaAgent\SynovaAgent.exe"`） |
| 预期 | `Get-Process -Name SynovaAgent` 有结果（Electron 壳 + backend-spawn 拉起后端） |
| 证据落点 | `evidence/D523-win-<date>/process.txt` → task-state.evidence.process |

## 第 3 步 出窗

| 项 | 内容 |
|---|---|
| 命令 | `Get-Process SynovaAgent \| Where-Object { $_.MainWindowTitle -ne '' }` |
| 预期 | 返回非空（主窗口标题 = SynovaAgent） |
| 证据落点 | `evidence/D523-win-<date>/window.txt` → task-state.evidence.window |

## 第 4 步 首诊页可达

| 项 | 内容 |
|---|---|
| 命令 | `Invoke-WebRequest -UseBasicParsing http://localhost:18790/api/healthz` |
| 预期 | StatusCode 200（后端健康；renderer 首诊入口 loadFile renderer/index.html 已随窗口加载） |
| 证据落点 | `evidence/D523-win-<date>/healthz.txt` + `backend.log` → task-state.evidence.healthz / backend_log |

## 红线

- 清理只 `Stop-Process -Id <本实例 pid>`，**严禁 `taskkill /IM node.exe`**（铁律 0-3，会杀所有 Node 进程）。
- 无 .exe 不伪造 evidence（DS4）——脚本 exit 2 即 waiting，等切片 A D517 产物落地后重跑。
