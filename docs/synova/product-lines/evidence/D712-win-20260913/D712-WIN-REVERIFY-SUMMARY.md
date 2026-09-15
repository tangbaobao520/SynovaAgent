# D712 桌面端重验 · Win 侧实测记录

执行: Win 侧 session（机器侧验证；代码域属 Mac DSH，本次 electron/ 与 scripts/install* 零改动）
日期: 2026-09-13 | 机器: PC-202605261327 | 会话用户: pc-202605261327\codexsandboxoffline（标准用户，非管理员）
派单文档: docs/synova/coordination/派单-桌面端线1重验批-D712-20260912.md —— 本地不存在（见「前置缺口 G0」）
被测产物: SynovaAgent-0.1.0-win32-x64.exe md5 D841D092088F0897F8AE780D462B46B5（93,112,012 B，D578 会话遗留于 D:\synova-desktop-Windows-200\）

## 四点状态

| 验收点 | 内容 | 状态 | 一句话 |
|---|---|---|---|
| 1-2 | Windows 双击安装 → 启动 → 出窗 | failed | 双击确实出安装向导窗（title「SynovaAgent 安装」）；但向导需人工点击、静默安装被提权框阻塞 → 端到端未走完 |
| 1-4 | 服务自启、开窗即用（零命令行） | failed | 出窗 OK + 后端自启 OK + healthz 200 OK；但渲染层 API 不可达（preload 未加载 + CSP 阻断）→「即用」不成立（F3） |
| 1-6 | 30 分钟内从安装到可诊断 | failed | 安装段被阻塞 →「从安装到可诊断」无法计时；仅测得启动→可诊断 = 12.4s（WITHIN_TARGET） |
| 1-7 | 升级/重装不丢数据 | pass | 覆盖安装语义 + 真实哨兵数据：51 表一致、关键表行数一致、integrity ok → DATA_RETAINED |

failed 的三点均为环境/路径阻塞如实记录，不是「测了没过」也不是「没测就放过」——每条都有落盘证据与复跑命令。

## 环境事实（决定本次能测什么）

| 事实 | 证据 |
|---|---|
| 会话用户为标准用户，不在 Administrators 组 | whoami /groups → 仅 BUILTIN\Users + CodexSandboxUsers；Medium 完整性 |
| %LOCALAPPDATA%/ %APPDATA% 指向 C:\Users\Administrator\... 且本会话不可写 | 写探针三处 DENY；仅 %TEMP% 可写 |
| 进程运行在私有沙箱桌面，非用户真实桌面 | GetProcessWindowStation=WinSta0，GetThreadDesktop=CodexSandboxDesktop-505ed377... |
| 该桌面无输入注入、无截屏 | SendKeys::SendWait 对记事本同样 Access is denied；CopyFromScreen → 句柄无效 |
| Chromium/Electron 默认无法在该桌面起窗 | 无 --no-sandbox 时主进程 exit=0x80000003（STATUS_BREAKPOINT）无窗；对照组 Edge 同样 0x80000003 且子进程 MainWindowHandle=0 |

## 各点实测明细

### 1-2 双击安装 → 启动 → 出窗 — failed

| 段 | 结果 | 证据 |
|---|---|---|
| 双击（无 /S 启动安装器）出向导窗 | OK: pid=17444 title=[SynovaAgent 安装] handle=1967190 | run-A-double-click-gui/wizard-window.txt + transcript.log |
| 向导点击翻页 | 不可自动化（本会话无输入桌面，记事本同样失败） | run-A-double-click-gui/transcript.log |
| /S 静默安装 | 挂起于 Windows「Run as」提权框（class=#32770 title=[Run as]），180s 未完成 | run-B-silent-install/transcript.log |
| /S + /D= 可写目录 | 同样提权框挂起 >=120s | run-C-silent-override/transcript.log |
| 环境变量重定向 LOCALAPPDATA/APPDATA/USERPROFILE 后再 /S | 同样提权框挂起 >=122s | 本批实测（命令见「复跑」） |
| 安装→启动→出窗（用 D578 已装产物） | OK，见 1-4 | run-F-nosandbox-runtime/ |

结论: 双击的入口通过；nsis.oneClick=false 决定向导必须人工点击，而本会话既不能点击也不能提权 → 端到端未完成。根因是会话权限，不是已证的产品缺陷（D578 会话在同一台机器上装成功过）。

### 1-4 服务自启、开窗即用 — failed（出窗与自启通过，「即用」不成立）

实测（run-F-nosandbox-runtime/，唯一动作 = 启动 app，未执行任何后端命令）:

| 断言 | 结果 | 证据 |
|---|---|---|
| 出窗 | OK: pid=21992 handle=1181378（window.txt 标题 synova-agent = 渲染层 document.title；同刻 process.txt 标题 SynovaAgent = 主进程初始标题） | window.txt / process.txt |
| 后端自启 | OK: backend.log 首行 ===== backend spawn 2026-09-13T01:37:09.258Z pid=20504 =====，20504 为包内 Electron node 模式进程 | backend.log |
| healthz | OK 200 | healthz.txt |
| 首诊入口 | OK: POST /api/diagnosis/consult → 401（入口活着且校验在工作） | transcript.log |
| 渲染层 API 可达 | 失败：全部被 CSP 拦截 | app-stderr.log（见 F3） |

### 1-6 30 分钟内从安装到可诊断 — failed

- 安装段阻塞 → 「安装→可诊断」总时长无法测量（不伪造）。
- 可测段: app_launch → first_diagnosis_ready = 12.4s，verdict WITHIN_TARGET（目标 1800s）——但这只是旅程后半段，不等于 1-6。
- 证据: run-F-nosandbox-runtime/timing.json
- 另: 官方计时脚本 scripts/desktop/first-diagnosis-timing.sh 的 prod 模式绑死 macOS（hdiutil 挂载 dmg）→ Win 无对应计时脚本（G3）。

### 1-7 升级/重装不丢数据 — pass

run-H-upgrade-data-seeded/（真实数据版）:

| 步骤 | 结果 |
|---|---|
| 造数据 | agent_memory=5, agent_sessions=3, sentinel_baselines=4, storage_kv=1（db-seed-sentinel.cjs） |
| before 指纹 | 51 表 / 上述行数 / integrity=ok |
| 重装（同路径替换安装文件，userData 零触碰） | 安装 exe md5 前后一致 612DBADC4BEEEC99639051D846A6D6F8 |
| 重装后启动 | healthz 200 OK |
| after 指纹 | 51 表一致 / 关键表行数一致 / integrity=ok |
| verdict | DATA_RETAINED（verdict.json，failures 空） |

口径说明: 与 D528 upgrade-data-verify.sh 一致的「覆盖安装语义」（同版本两次安装）。真 NSIS 升级路径（Uninstall + 重装、--updated）本会话被提权框阻塞未测，如实标注为残留。

## 发现（Win 侧实测查出的缺口）

### F1 — 官方验收脚本在本机无限挂起（P1，运维风险）

scripts/desktop/win-install-verify.ps1 步骤② Start-Process $exe /S -Wait 无超时。当机器需要提权时（本机会弹「Run as」），脚本永久挂起，既不 exit 0 也不 exit 1/2——违反其自身「exit 1 = 断言失败」契约。
证据: run-E-official-script/b-staged-out.txt（停在第②步 >120s 仍在跑）。

### F2 — release/*.exe 不在 git，官方脚本在净仓库态恒为 waiting（P2，可复现性）

release/ 被 .gitignore:68 忽略；当前仓库 release/*.exe 数量 = 0（只有旧的 win-unpacked/）。
→ 官方脚本在净仓库态必然 exit 2（waiting）。这不是缺陷（脚本按契约正确进 waiting，不伪造），但意味着 1-2 的验收证据无法从 git 复现——与 D572「证据不在 git = 温床」同型风险。
证据: run-E-official-script/a-no-exe-waiting.txt（waiting 文案 + EXIT=2）。

### F3 — 打包态渲染层无法访问后端 API（P0 候选，非 Win 专属）

链路（源码已核）:

1. electron/main.cjs createWindow() 的 webPreferences 只有 { preload, contextIsolation: true, nodeIntegration: false }——未设 sandbox: false；rg -n "sandbox" electron/*.cjs 零命中。
2. Electron >=20 默认 sandbox: true → electron/preload.cjs 的 const config = require('./config.json') 在沙箱化 preload 中不允许。
3. Electron 实报: Unable to load preload script: ...app.asar\electron\preload.cjs / Error: module not found: ./config.json（source: node:electron/js2c/sandbox_bundle）。
4. contextBridge.exposeInMainWorld('electronAPI', ...) 从未执行 → window.electronAPI === undefined。
5. electron-renderer/src/lib/api.ts::getApiBase() 在 electronAPI 缺失时返回 ''（注释写明这是 dev 降级路径）→ prod 的 file:// 页面上相对路径解析成 file:///D:/api/...。
6. CSP（connect-src http://localhost:* http://127.0.0.1:*）全部拦截: /api/sentinel/signals、/api/loops/status、/api/actions、/api/notifications、/health、/api/llm/config；渲染层报 [useNotifications] fetch failed、[llm-config] 请求失败 — 降级: Failed to fetch。

证据: run-F-nosandbox-runtime/app-stderr.log
为何既有验收没抓到: D523/win-install-verify 的四断言（进程/窗口/healthz/日志）在渲染层断链时全部为绿。
注意: 该断链与本次 --no-sandbox 适配无关（错误 source 证明 preload 仍走 sandbox bundle），preload 沙箱化是跨平台的 → Mac 打包态同样存在，需 Mac 侧交叉确认。

### F4 — 本会话观测到的降级（不判定为缺陷）

- Unable to create status tray icon / Error setting status tray icon image / Unable to set tooltip：沙箱桌面无通知区域所致，main.cjs 已 try/catch 告警降级。
- preload.cjs 未加载后，通知/托盘 IPC 能力整体缺失（F3 的同源后果）。

### G0-G3 前置缺口

- G0: 派单文档 派单-桌面端线1重验批-D712-20260912.md 在本地 main（d07522a1，与 origin/main 零分叉）不存在 → 按用户消息中的 4 点与硬要求执行。
- G1: %LOCALAPPDATA%\Programs\SynovaAgent 本会话不可写 → 默认 per-user 安装位不可测。
- G2: scripts/desktop/win-install-verify.ps1 硬编码 release/*.exe + 默认安装位，无 -InstallDir/-UserDataDir 覆盖 → 受限会话无法用它做任何实测。
- G3: upgrade-data-verify.sh / first-diagnosis-timing.sh 均为 macOS 绑定（hdiutil/dmg/md5）→ Win 侧 1-6/1-7 无官方脚本（本次以自研镜像脚本补齐）。

## 本次环境适配（必读，否则证据不可解释）

1. 应用来自 D578 会话已落盘的真实 NSIS 安装产物（含 Uninstall SynovaAgent.exe），复制到非 8.3 短路径的可写目录；
2. 启动加 --no-sandbox（沙箱桌面无法起 Chromium 沙箱）；
3. --user-data-dir=<可写目录> 覆盖 userData（默认 %APPDATA% 不可写）。

三项均未改产品代码。F3 与适配项 1/3 无关；适配项 2 见 F3 说明。

## 复跑

```powershell
$ev = "docs/synova/product-lines/evidence/D712-win-20260913"
# 1-2（双击，出向导窗即证；点击需人工桌面）
pwsh -File "$ev/run-1-install-journey.ps1" -OutDir "$ev/run-A-double-click-gui"
# 1-2/1-4/1-6（已装态运行时）
pwsh -File "$ev/run-2-installed-app-runtime.ps1" -AppExe <安装目录>\SynovaAgent.exe -UserDataDir <可写> -OutDir <证据目录> -ExtraAppArgs '--no-sandbox'
# 1-7（造数据 → 覆盖重装 → 比对）
& <安装目录>\SynovaAgent.exe "$ev/db-seed-sentinel.cjs" <安装目录>\resources <userData>\data\synova.db
pwsh -File "$ev/run-3-upgrade-data-retention.ps1" -AppDir <安装目录> -UserDataDir <可写> -FreshSource <同版本另一份> -OutDir <证据目录>
```

## 证据清单

| 目录/文件 | 内容 |
|---|---|
| run-A-double-click-gui/ | 双击出向导窗证据（window title/handle）+ 输入注入不可用记录 |
| run-B-silent-install/ run-C-silent-override/ | /S 与 /S+/D 两条静默路径的提权阻塞记录 |
| run-D-installed-runtime/ | 8.3 短路径导致的启动失败记录（反证路径因素） |
| run-E-official-script/ | 官方脚本净态 exit 2 waiting + 暂存 exe 后第②步挂起 |
| run-F-nosandbox-runtime/ | 1-4/1-6 主证据：window/process/healthz/backend.log/timing.json/app-stderr.log（含 F3） |
| run-G-upgrade-data/ run-H-upgrade-data-seeded/ | 1-7 前后指纹 + verdict.json（H 为真实数据版） |
| run-1/2/3-*.ps1 db-*.cjs | 可复跑的采样/计时/造数脚本（本次新增，不改产品代码） |
