# Founder Demo — Windows 部署验收 checklist（D523 + D536）

> 目标：创始人在 Windows 电脑上零命令行验证「双击安装 → 启动 → 出窗 → 首诊页可达」。
> 一键实跑：`powershell -File scripts/desktop/win-install-verify.ps1`（exit 0 = 全过）。
> 前置：切片 A D517 的 `release/*.exe` 存在（缺失则脚本 exit 2 = waiting，不伪造）。
> ✅ **D536 部署验收完成态（2026-08-26）**：CI artifact 已下载校验（exe md5 落盘）；**实际安装实测 waiting——GUI dsh-ssh 未配置 Windows 目标机**（D523 DS4 先例，不伪造）。

## 第 0 步：下载 CI 安装包 + md5 校验（D536 新增）

```bash
# 从 GitHub Actions artifact 下载（token: ~/.dsh/.credentials.yaml → refs.GITHUB_TOKEN）
TOKEN=<读自 credentials.yaml>
curl -L -H "Authorization: token $TOKEN" -o /tmp/synova-win.zip https://api.github.com/repos/tangbaobao520/SynovaAgent/actions/artifacts/9572059369/zip
md5 /tmp/synova-win.zip                            # 落 evidence/D536-artifacts-<date>/md5.txt
unzip -o -q /tmp/synova-win.zip -d /tmp/win-x/ && md5 /tmp/win-x/*.exe
```
- 预期产物：`SynovaAgent-<版本>-win32-x64.exe`（CI 产物 ≈215MB zip 解压）
- 证据落点：`evidence/D536-artifacts-<date>/`（zip+exe 指纹）→ task-state/D536.json impl.evidence

## 第 1 步 安装

| 项 | 内容 |
|---|---|
| 命令 | 双击 `SynovaAgent-*.exe`（或脚本 `Start-Process <exe> /S` 静默装） |
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

## 远程执行路径（D536，GUI dsh-ssh 配置 Win 主机后）

```text
1. ssh_upload release/SynovaAgent-*.exe → C:\synova-release\        # 传 exe 到 Win 目标机
2. ssh_exec "powershell -File C:\synova-release\scripts\desktop\win-install-verify.ps1; echo exit=$LASTEXITCODE"
3. 回传 evidence/D523-win-<date>/ 五类文件到本机 evidence/D536-win-<date>/
```

## 完成态记录（D536，2026-08-26）

| 段 | 结论 | 说明 |
|---|---|---|
| ① artifact 下载+md5 | ✅ | `evidence/D536-artifacts-20260826/md5.txt`（zip + exe 指纹） |
| ② 安装/启动/出窗/首诊 | ⏸ **waiting** | GUI dsh-ssh 未配置 Windows 目标机（`ssh_list` 无主机）——D523 DS4 先例，不伪造；Mac 侧不受影响 |

## 红线

- 清理只 `Stop-Process -Id <本实例 pid>`，**严禁 `taskkill /IM node.exe`**（铁律 0-3，会杀所有 Node 进程）。
- 无 .exe 不伪造 evidence（DS4）——脚本 exit 2 即 waiting，等产物落地后重跑。
- **无 Win 目标机不伪造实测（D523 DS4）**——GUI dsh-ssh 配置后按上方「远程执行路径」补测。
