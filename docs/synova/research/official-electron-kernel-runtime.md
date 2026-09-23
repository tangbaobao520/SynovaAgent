# D870-A 切片｜官方参照系电子内核运行 9 面实证（DeepSeek Harness Electron 壳）

> 任务：task-1（D870-A）｜作者：coder-ab｜日期：2026-09-21
> 工作树：`/Users/wane/SynovaAgent/.synova-wt-d870`（分支 `feat/d870-official-baseline-study`）
> 本件不承诺 Synova 任何已实现能力；本件只登记**官方参照系中的事实 + 我方借鉴动作**。

---

## 〇、参照系（唯一）

```
/Users/wane/src/deepseek-harness/  @  tag dsh-v0.1.6-alpha.2  @  commit ddefc45fbc7f8e46dd73185e68295696d1297887
```

复现命令与原始输出：

```console
$ git -C /Users/wane/src/deepseek-harness log -1 --format='%H %d'
ddefc45fbc7f8e46dd73185e68295696d1297887  (grafted, HEAD -> master, tag: dsh-v0.1.6-alpha.2, origin/master, origin/HEAD)

$ git -C /Users/wane/src/deepseek-harness status --porcelain
（空输出 = 0 脏）
```

### ⚠️ 版本错配警示（必须与上表头同时引用）

| 断面 | 版本 | 取样命令 | 原始输出 |
|---|---|---|---|
| 源码 checkout | `0.1.6-alpha.2` | `git log -1 --format='%d'` | `tag: dsh-v0.1.6-alpha.2` |
| 打包运行时 `dependencies/dsh` | `0.1.6-alpha.1` | `grep -m2 '"version"' "$R/dependencies/dsh/package.json"` | `"version": "0.1.6-alpha.1"` |
| `.app` 壳 | `0.15.7` | `grep -A1 CFBundleShortVersionString "/Applications/Deepseek Harness Desktop.app/Contents/Info.plist"` | `<string>0.15.7</string>` |
| 已下载未安装更新 | `0.15.8` | `ls "$R/updates/"` | `Deepseek.Harness.Desktop_0.15.8_aarch64.dmg`（9月20 23:32） |

其中 `R="/Users/wane/Library/Application Support/io.github.hairyf.deepseek-harness-desktop"`。

**结论口径**：本件一切 file:line 结论取自**源码 checkout（0.1.6-alpha.2）**；凡涉及"打包/签名/自动更新/离线"的**发布态**结论，才引用 `.app`（0.15.7）与 `dependencies/dsh`（0.1.6-alpha.1）补充断面。
**禁用断面**（按 CTO 裁定，本件零引用）：`~/Library/Application Support/synova-dsh-desktop/`（我方数据目录）、`~/.dsh/`（profile）。
**官方树只读**：本件全程未在 `/Users/wane/src/deepseek-harness/` 写入任何文件。

---

## 一、度量口径与偏差声明（先钉口径，再报结论）

派单件给了 10 项"已实测面证据密度"。为免口径混淆，本件统一采用 **`git grep`（仅 tracked 文件）、行计数**，并**如实报告与派单件的偏差**：

```console
$ cd /Users/wane/src/deepseek-harness && for pat in BrowserWindow "electron-updater" contextBridge "ipcRenderer.invoke" "ipcMain.handle" powerMonitor requestSingleInstanceLock "before-quit" "app.whenReady" "window-all-closed"; do printf "%-26s %s\n" "$pat" "$(git grep -c -- "$pat" -- 'apps/*' 'packages/*' | awk -F: '{s+=$NF} END {print s+0}')"; done
BrowserWindow              63
electron-updater           23
contextBridge              18
ipcRenderer.invoke         15
ipcMain.handle             10
powerMonitor               9
requestSingleInstanceLock  5
before-quit                5
app.whenReady              4
window-all-closed          2
```

| 指标 | 派单件值 | 本件实测（git grep 行数） | 偏差 |
|---|---|---|---|
| BrowserWindow | 77 | **63** | −14 |
| electron-updater | 22 | **23** | +1 |
| contextBridge | 18 | **18** | 0 |
| ipcRenderer.invoke | 15 | **15** | 0 |
| ipcMain.handle | 10 | **10** | 0 |
| powerMonitor | 9 | **9** | 0 |
| requestSingleInstanceLock | 6 | **5** | −1 |
| before-quit | 5 | **5** | 0 |
| app.whenReady | 4 | **4** | 0 |
| window-all-closed | 2 | **2** | 0 |

偏差成因（已实测排除/定位，不猜）：

```console
$ grep -rn "BrowserWindow" apps/desktop packages --exclude-dir=node_modules | wc -l
      93
$ git grep -o -- "BrowserWindow" -- 'apps/*' 'packages/*' | wc -l
      69
$ git -C /Users/wane/src/deepseek-harness status --porcelain --untracked-files=all | wc -l
       0
```

即同一把 `BrowserWindow` 尺子在不同扫描口径下得 63（tracked 行）、69（tracked 出现次数）、93（含被 gitignore 的构建产物行）。**派单件的 77 与本件三口径均不重合**，成因未定——本件不试图解释它，只声明：**本件全部结论用 tracked 行口径，且每条都可用 `sed -n '<N>p'` 逐行复现（见 §十一 全量自检输出）**。密度数字在本件中**仅作导航**，不作任何判据。

### 托盘面：派单件前提"Tray = 0"→ 实测成立

```console
$ git grep -cw -- "Tray" | wc -l
       0
$ grep -rni "tray" apps/desktop/src/ apps/desktop-host/src/ | wc -l
       0
$ grep -rni "Tray" apps/ packages/ --include=*.ts --include=*.tsx | wc -l
     182
```

说明：`Tray`（词界）在全仓库 tracked 文件中 **= 0**，在 Electron 主/宿主进程源码中 **= 0**。首轮探针的 182 处命中经逐条检视**全部是 `stray`（英文"零散的"）子串误报**（例：`apps/web/tests/seeded-history.e2e.ts:5` `// events — with ZERO model calls in replay (no replay fixture; a stray stream`），与 Electron 托盘无关。**前提成立，按 CTO 裁定处理**（见 §十）。

---

## 二、①启动时序与生命周期

### A-01 单实例锁先于任何 profile 生命周期 · `可直接复制`

官方实现：

```console
$ sed -n '20p' apps/desktop/src/single-instance.ts
  if (!application.requestSingleInstanceLock()) {
$ sed -n '774p' apps/desktop/src/main.ts
const ownsDesktopInstance = claimDesktopSingleInstance(app, () => { focusPrimaryWindow() })
```

`claimDesktopSingleInstance`（`single-instance.ts:16-25`）在**任何目录/数据库/子进程启动之前**抢进程级锁，抢不到直接 `application.quit()` 并返回 `false`；拿到锁的进程才注册 `second-instance` → 聚焦既有窗口。`main.ts:776` 用 `if (ownsDesktopInstance)` 把整个 `main()` 挡在锁之后。

**可执行借鉴项**：在 Synova 桌面端 `main.ts` 顶层，把单实例锁置于一切初始化之前；第二实例不再启动第二套 Agent 进程，改为唤起既有窗口。
**我们改到什么程度（可验收）**：双击图标启动第二次 → 只存在 1 个主进程（`ps` 计数 = 1）、1 份 SQLite 句柄；第二个实例在 500ms 内退出（exit code 0）且第一实例窗口获得焦点。反例判据：出现第 2 个 `data/synova.db` 写入者。

### A-02 单入口 `whenReady` + 顶层失败落盘 + 致命上报 · `可直接复制`

```console
$ sed -n '776p;779p' apps/desktop/src/main.ts
if (ownsDesktopInstance) void app.whenReady().then(main).catch(async (error: unknown) => {
  const diagnosticFile = process.env.DSH_DESKTOP_DIAGNOSTIC_FILE
```

`main.ts:776-787`：`app.whenReady().then(main)` 是**唯一启动入口**；启动失败时先把 `error.stack ?? message` 写入 `DSH_DESKTOP_DIAGNOSTIC_FILE`（`await writeFile(...).catch(() => undefined)`，写盘失败不掩盖原始错误），再 `reportFatal`；`reportFatal` 自身再失败 → `app.exit(1)`（`main.ts:784-787`）。

**可执行借鉴项**：Synova 桌面启动失败时，把完整栈写入约定诊断文件，并保证"写盘失败不等于丢失原始错误"。
**我们改到什么程度（可验收）**：人为让启动抛错 → 诊断文件出现且含栈；把诊断目录设为不可写 → 进程仍以非 0 退出码退出并打印原始错误（不得静默吞错）。

### A-03 显式退出状态机：`preventDefault` → 异步清理 → 再 quit · `可参照`

```console
$ sed -n '699p;708p;715p' apps/desktop/src/main.ts
  app.on('before-quit', (event) => {
    event.preventDefault()
      .catch((error: unknown) => { console.error(error) }).finally(() => { app.quit() })
```

`main.ts:699-716` 的次序：置 `shuttingDown` → 记 journal `quit-requested` → 若安装器已接管退出则只 dispose UI 后放行 → 若已 `quitting` 则直接返回 → 否则 `preventDefault()`、置 `quitting`、**先 `mainWindow?.hide()`**（视觉上立即响应）→ 逐个 `dispose()` → `Promise.all([...dispose, backend.close()])` → `.finally(() => app.quit())`。配合 `main.ts:696-698`（非 darwin 才 `window-all-closed` 即退出）与 `main.ts:693-695`（darwin 上 `activate` 重建窗口）。

**可执行借鉴项**：把退出做成"两阶段 + 幂等 + 清理完成才真退"，清理失败也必须退出（catch 里打日志，不阻塞）。
**我们改到什么程度（可验收）**：关窗瞬间窗口消失（≤1 帧）；后台 sentinel/cron 在退出前完成 `dispose`（无残留 `setInterval` 句柄）；`backend.close()` 抛错时进程仍在 10s 内退出，且 stderr 有该错误。

### A-04 `shuttingDown` / `quitting` 双标志：区分"收到退出请求"与"已进入退出流程" · `可参照`

```console
$ sed -n '45p;193p' apps/desktop/src/main.ts
let shuttingDown = false
  let quitting = false
```

`shuttingDown` 在模块级（`main.ts:45`，供 `reportFatal` 在 `main.ts:66` 抑制退出中的致命弹窗），`quitting` 在 `main()` 内（`main.ts:193`，供 `navigateMain`、`publishUpdate`、`automaticCheck` 抑制退出中的新工作）。两者语义不同：`shuttingDown` = 系统正在关，**不要再弹框**；`quitting` = 已开始关，**不要再起新活**。

**可执行借鉴项**：Synova 退出时用两个语义不同的标志分别抑制"弹窗"与"起新活"，避免退出流程中弹出错误框或重启一轮诊断。
**我们改到什么程度（可验收）**：退出过程中（清理未完成）触发一次 fatal → 不出现新对话框，仅 stderr 记录；退出过程中到达一次定时触发 → 不启动新诊断（日志无新 run id）。

---

## 三、②主-渲染边界与 IPC 契约

### A-05 窗口安全三件套为硬基线 · `可直接复制`

```console
$ sed -n '136,138p' apps/desktop/src/main.ts
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
```

出现在唯一的主窗口工厂 `createWindow`（`main.ts:111-141`）的 `webPreferences`（`main.ts:134-140`，另含 `preload` / `webSecurity: true`）。

**可执行借鉴项**：Synova 桌面端一律 `nodeIntegration:false` + `contextIsolation:true` + `sandbox:true`，能力只经 preload 白名单暴露。
**我们改到什么程度（可验收）**：渲染进程内 `typeof require === 'undefined'` 且 `typeof process === 'undefined'`；三开关任一被改为非上述值 → 捕获到失败（可加断言测试）。

### A-06 IPC 频道名集中声明为常量表 · `可直接复制`

```console
$ sed -n '6,7p' apps/desktop/src/ipc.ts
export const DESKTOP_IPC = {
  boot: 'dsh-desktop:boot',
```

`ipc.ts:6-16` 是全部 9 个频道的**唯一声明点**（`boot` / `bootFailed` / `directoryPick` / `updatesStatus` / `updatesOpen` / `updatesPresentation` / `nativeThemeSet` / `windowsAppearance` / `windowsMenu`），主进程与 preload 同源引用；注释明言"channels kept private to the desktop application bundle"。

**可执行借鉴项**：Synova 把 IPC 频道名收敛到单一 `ipc.ts` 常量表，禁止字符串字面量散落。
**我们改到什么程度（可验收）**：`grep -rn ":\s*'synova-desktop:" src/` 的命中全在常量表文件内；新增频道必须同时改常量表与类型。

### A-07 暴露给产品的 API 面被压到最小（版本化 + 只读状态 + 无 URL 能力）· `可直接复制`

```console
$ sed -n '54p' apps/desktop/src/ipc.ts
export interface DshDesktopProductApi {
```

`ipc.ts:53-61`：产品文档只能拿到 `protocolVersion: 1` 与 `updates.{status,open,subscribe}`。紧邻注释直接写明安全边界：**"Product documents cannot supply update versions, package URLs, or installation authorization."**（`ipc.ts:53`）。

**可执行借鉴项**：Synova 给渲染层的桥接面按"能力最小化"设计并带 `protocolVersion`；任何"目标版本号 / 下载地址 / 安装授权"都不接受渲染层输入。
**我们改到什么程度（可验收）**：渲染层尝试传入 version/url 参数 → 主进程忽略（不是"校验后接受"）并落一条拒绝日志；直接调用 `window.dshDesktop.updates.install(...)` → 抛 "not a function"。

### A-08 发送方来源强校验：自定义协议 + hostname 白名单 · `可直接复制`

```console
$ sed -n '71p' apps/desktop/src/ipc.ts
export function assertDesktopSender(event: IpcMainInvokeEvent, hostnames: readonly string[]): void {
```

`ipc.ts:71-78`：`senderFrame === null` 直接拒；`new URL(senderFrame.url)` 的 `protocol` 必须是 `dsh-app:` 且 `hostname` 必须命中白名单，否则抛 `rejected IPC from an unowned renderer`。

**可执行借鉴项**：Synova 每个 IPC handler 入口先做"来源协议 + 来源主机"白名单校验，校验失败抛错而非静默返回。
**我们改到什么程度（可验收）**：从首页 iframe / 第三方页面发起的同频道调用 → 100% 抛错；`grep -c assertDesktopSender` 的调用点数等于 handler 数。

### A-09 二次校验"属于哪个窗口 + 是否主帧" · `可直接复制`

```console
$ sed -n '228,229p' apps/desktop/src/main.ts
    if (mainWindow === undefined || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents
      || event.senderFrame === null || event.senderFrame !== mainWindow.webContents.mainFrame) {
```

`main.ts:226-232` 的 `assertProductSender` 在 A-08 之上再叠加**窗口身份 + 主帧身份**；`main.ts:415-416`（boot）、`main.ts:449-450/453-454`（updates）、`main.ts:610-613`（windowsMenu）逐处复核。

**可执行借鉴项**：Synova 的主窗口级 IPC 必须同时满足"频道白名单（A-06）+ 来源白名单（A-08）+ 拥有窗口 + 主帧"。
**我们改到什么程度（可验收）**：从子帧（iframe）发起主窗口级调用 → 抛 `rejected IPC from a non-primary frame`；窗口销毁后延迟调用 → 抛错不崩溃。

### A-10 导航与新窗口全封闭（外链走系统浏览器）· `可直接复制`

```console
$ sed -n '142p;173p;178p' apps/desktop/src/main.ts
  window.webContents.setWindowOpenHandler(({ url }) => {
  window.webContents.on('will-navigate', (event, url) => {
      event.preventDefault()
```

`main.ts:142-145`：`http/https` 交 `shell.openExternal`，其余一律 `{ action: 'deny' }`。`main.ts:173-181`：仅允许本应用协议、以及 `http:` 且与当前 origin 相同的目标，其余 `preventDefault()` 并外抛系统浏览器——**产品窗口内不出现任意站点**。

**可执行借鉴项**：Synova 产品窗口内禁止任意导航；外部链接一律系统浏览器打开。
**我们改到什么程度（可验收）**：在应用窗口内 `location.href='https://example.com'` → 窗口 URL 不变且系统浏览器被唤起；`window.open(...)` 返回 null 且无新窗口产生。

### A-11 自定义协议注册为 privileged（standard/secure/stream/codeCache）· `可参照`

```console
$ sed -n '70p;78p' apps/desktop/src/main.ts
protocol.registerSchemesAsPrivileged([{
    codeCache: true,
```

`main.ts:70-80` 为应用协议声明 `standard / secure / supportFetchAPI / corsEnabled / stream / codeCache`。注意其位置在 `main()` 之外、模块顶层——**必须在 `app.whenReady` 之前**。

**可执行借鉴项**：Synova 若用自定义协议承载本地 UI，注册 privileged 必须发生在 ready 之前，并显式开启 `stream`（SSE/流式输出）与 `codeCache`（前端资源不再每次重新编译）。
**我们改到什么程度（可验收）**：流式响应经自定义协议可增量到达（首字节 < 500ms，非整包）；注册代码若被挪到 `whenReady` 之后 → 捕获到启动期错误。

### A-12 preload 按 origin 分支：非产品 origin 降级为最小 stub · `可直接复制`

```console
$ sed -n '22p;36p' apps/desktop/src/preload-app.ts
if (location.protocol === `${SCHEME}:` && location.hostname === 'app') {
contextBridge.exposeInMainWorld('dshDesktop', location.protocol === `${SCHEME}:` && location.hostname === 'app' ? product : { protocolVersion: 1 })
```

`preload-app.ts:22-31`：只有 `dsh-app://app` 才挂 `__DSH_DIRECTORY_PICKER__` 与 `dshDesktopBoot`。`preload-app.ts:36`：任何其他 origin 下 `dshDesktop` **仍然存在但只剩 `{ protocolVersion: 1 }`**——接口形态稳定（前端不必做存在性判断），能力为空（拿不到任何 invoke）。`preload-app.ts:35` 注释点明"Main-process IPC also verifies the owning window and top frame"（渲染侧声明 + 主进程复核，两侧都做）。

**可执行借鉴项**：Synova 的 preload 按 origin 分级授权；非产品页给"同形态、零能力"的 stub，避免前端散落 `if (api)` 分支。
**我们改到什么程度（可验收）**：非产品 origin 下 `dshDesktop.protocolVersion === 1` 且 `dshDesktop.updates === undefined`；产品 origin 下二者齐备。

---

## 四、③长驻（cron/哨兵/后台）与省电挂起

### A-13 唤醒即重检：`powerMonitor.on('resume')`，并在 `will-quit` 反注册 · `可直接复制`

```console
$ sed -n '571p;574p' apps/desktop/src/main.ts
  powerMonitor.on('resume', automaticCheck)
    powerMonitor.off('resume', automaticCheck)
```

`main.ts:567-576`：`automaticCheck()` 同时触发"策略检查（`foreground-or-resume`）"与"更新轮询检查"，二者各自 catch 不互相拖垮；`main.ts:572-576` 在 `will-quit` 里 `dispose()` 定时器并 `off('resume')` 后 `updates.dispose()`。此外 `main.ts:661` 把同一 `automaticCheck` 挂在窗口 `focus` 上——**回到前台也算一次机会**。

**可执行借鉴项**：Synova 的 sentinel/cron 在系统唤醒、窗口回前台时立即补一次检查（长时间挂起会漏掉 cron 触发点），并在退出时反注册监听。
**我们改到什么程度（可验收）**：合盖挂起 2h 后唤醒 → 30s 内出现一次补检（日志含原因 `resume` 或 `focus`）；退出后 `powerMonitor` 监听数归零。

### A-14 长驻轮询三要素：完成式截止 + 指数退避 + 抖动 + 单调时钟 · `可直接复制`

```console
$ sed -n '102p;106p' apps/desktop/src/update-schedule.ts
    this.delay = failed ? Math.min(maxBackoffMs, this.delay * 2) : intervalMs
    this.nextCheck = this.now() + delay
```

`update-schedule.ts` 是我方长驻任务最值得直接搬的一块：
- `:92-97` `complete()`——**完成式截止**：`activeChecks` 计数归零才排下一次，绝不用"固定间隔 + 不管上次是否跑完"（避免慢任务叠加）。
- `:99-106` `schedule()`——失败则 `delay *= 2` 且 `Math.min(maxBackoffMs, ...)` 封顶；成功回落到 `intervalMs`；**抖动** `delay * (1 ± jitter)`（`:103-105`，默认 jitter 0.2）。
- `:48-49, 54`——`now` 注入为 `performance.now()`（**单调时钟**），注释明写"independent of wall-clock corrections"（不因系统改时间而紊乱）。
- `:26-31`——间隔/上限/抖动全部经范围校验（1_000 ~ 2_147_483_647ms，jitter ∈ [0,1]，`maxBackoffMs >= intervalMs`）。
- `:86-90`——`dispose()` 置位 + `clearTimeout`，且 `:66-68` 明确 `disposed` 后拒绝新工作。

**可执行借鉴项**：把 Synova 的 Sentinel 定时器与平台重试统一改成"完成式截止 + 指数退避 + 抖动 + 单调时钟 + 可注入 now/random"，并把参数经范围校验。
**我们改到什么程度（可验收）**：注入恒失败的上游 → 相邻两次重试间隔按 2 倍增长且不超过上限、且同配置两次运行的间隔不相等（抖动生效）；注入固定 `now`/`random` 的测试 → 断言序列可复现（这是可写成测试的形态）；`dispose()` 后触发一次 → 抛 `polling is disposed` 且无新定时器。

### A-15 后台任务闸：安装前"锁准入 → 排空在途 → 再看是否仍有活" · `可参照`

```console
$ sed -n '40p;45p;46p' apps/desktop-host/src/update-tasks.ts
      await Promise.all(pendingRequests)
    const liveAgents = agents.list()
    return liveAgents.some(agent => agent.status === 'running'
```

`apps/desktop-host/src/update-tasks.ts`：`action='lock'` 时先 `locked = true`（`:37`），此后新请求一律 `503`（`:20-23`），再 `await Promise.all(pendingRequests)` **排空已准入的在途请求**（`:40`），随后用 `generation` 复核锁未被顶替（`:43`），最后才检查是否仍有活：`agent.status === 'running'`、`inbox.nextTurn/nextStep` 非空、以及任意 agent 的 job 处于 `running|stopping`（`:45-49`）。注释 `:39` 点明理由——**"Read requests are not tasks; admitted writes must finish before the final work check."**

**可执行借鉴项**：Synova 的"热替换/迁移/停机维护"前，用一个准入闸：先拒新请求，再等已准入请求排空，最后复查哨兵/诊断是否仍在跑；**不能只看"当前是否在跑"就动手**（在途写入会被截断）。
**我们改到什么程度（可验收）**：在诊断运行中途发起停机 → 新请求收到 503；已准入请求全部收尾后才返回"可停机"；若期间又有新任务被准入 → 返回"仍活跃"并拒绝停机。

### A-16 省电挂起面：官方**只处理了 `resume`，没有 `suspend` 处理，也没有 `powerSaveBlocker`** · `官方无实现`

```console
$ git grep -nE "powerSaveBlocker|backgroundThrottling|setBackgroundThrottling|disableHardwareAcceleration" -- 'apps/*' 'packages/*'
apps/desktop/tests/fixtures/workspace-updates.mjs:55:  contents.setBackgroundThrottling(false)
apps/desktop/tests/fixtures/workspace-updates.mjs:83:      contents.setBackgroundThrottling(throttled)

$ git grep -nE "powerMonitor\.(on|once)\(|'suspend'|\"suspend\"" -- 'apps/desktop/src' 'packages/*/src'
apps/desktop/src/main.ts:571:  powerMonitor.on('resume', automaticCheck)
```

实测：主进程源码里 `powerMonitor` 只有 **1 处**注册（`resume`），**没有任何 `suspend` 处理**；`powerSaveBlocker` 在主源码里**0 处**（唯一 2 处 `setBackgroundThrottling` 在测试夹具里，不是产品行为）。因此官方**没有做**"进入睡眠前保存/落盘"与"长任务期间阻止休眠"。

**我方自研方案（明标为自研，不称借鉴）**：Synova 的长驻哨兵需要补齐官方缺的两个动作——① `powerMonitor.on('suspend')` 时把在跑的诊断/哨兵进度落盘（写 `run_state` + 时间戳），唤醒后按 A-13 补检并以落盘状态续跑而非重跑；② 仅在**用户显式启动的、有时限的长任务**期间用 `powerSaveBlocker.start('prevent-app-suspension')` 并在任务结束/超时 `stop()`，**不得**常态持有（否则笔记本续航被吃）。
**我们改到什么程度（可验收）**：挂起→唤醒后，进行中的 run 从落盘状态继续（run id 不变、无重复副作用）；无长任务时 `powerSaveBlocker.isStarted()` 为 false；长任务结束 5s 内自动 stop。

---

## 五、④崩溃恢复与重启

### A-17 只报第一次致命错误 + 三档恢复动作（退出/重启/禁用第三方插件）· `可参照`

```console
$ sed -n '40p;52p;53p;54p' apps/desktop/src/fatal-recovery.ts
    if (this.reported) return
        buttons: addressInUse
          ? [messages.exitApplication, messages.restartApplication]
          : [messages.exitApplication, messages.restartApplication, messages.disableThirdPartyPlugins],
```

`fatal-recovery.ts:39-75` 的 `report()`：
- `:40-41` **首错去重**：`reported` 一旦置位，后续报告立即返回（"later reports cannot replace it or open another dialog"），避免弹窗风暴。
- `:46-58` **按错误类分流**：命中 `listen EADDRINUSE` 时只给"退出 / 重启"两项（端口被占重启无用，改为不同文案 `startupAddressInUse`）。
- `:51` 详情截断：`dialogDetail`（`:16-22`）取 stack **末 8 行**、按 1200 字符预算裁剪、避开代理对截半（`/^[\uDC00-\uDFFF]/u`）、并拼上"重装建议"。
- `:59-73` **恢复动作失败可重入**：用户选重启但 `stop()` 失败 → 不放弃，改为显示 `recoveryOperationFailed` 并把失败详情作为新一轮 detail **循环重试**（`for(;;)`）。
- `:66` 选"禁用第三方插件"时先 `stop()` 再 `disablePlugins()` 再 `restart()`。

**可执行借鉴项**：Synova 桌面端致命错误走"首错单弹窗 + 按错误类裁剪选项 + 提供一键禁用扩展的恢复路径"，并把"恢复动作失败"当一等公民处理。
**我们改到什么程度（可验收）**：连续抛 5 次致命错误 → 只出现 1 个对话框；错误为端口占用时不出现"禁用插件"按钮；`stop()` 抛错后弹窗仍可用且第二次点击可成功退出。

### A-18 渲染侧三条线统一归口 `reportFatal`（加载失败 / preload 失败 / 进程死亡）· `可直接复制`

```console
$ sed -n '665p;669p;674p' apps/desktop/src/main.ts
        reportFatal(new Error(`Desktop page failed to load: ${url} (${String(code)}: ${description})`))
      if (!quitting && !window.isDestroyed()) reportFatal(error)
        reportFatal(new Error(`Desktop renderer exited: ${details.reason}`))
```

`main.ts:663-676`：`did-fail-load`（跳过 `-3` 即 `ERR_ABORTED`，那是正常导航取消）、`preload-error`、`render-process-gone`（排除 `clean-exit`）三条线都进同一个 `reportFatal`；且先判 `!quitting && !window.isDestroyed()`，**退出中的死亡不算崩溃**。

**可执行借鉴项**：Synova 把"页面加载失败 / preload 失败 / 渲染进程死亡"统一归口到同一个恢复入口，并显式排除正常导航取消与主动退出。
**我们改到什么程度（可验收）**：kill 渲染进程 → 弹恢复框且分类为"渲染退出"；正常页面跳转 → 不弹框（错误码 -3 被排除）；退出过程中 kill → 不弹框。

### A-19 `AggregateError` 诊断递归展开（错误不丢层）· `可直接复制`

```console
$ sed -n '11p' apps/desktop/src/startup-error.ts
    : error instanceof Error ? error.message : String(error)
```

`startup-error.ts:8-16`：遇到 `AggregateError` 时把 `error.message` 与**每个子错误的 message** 换行拼接；非 Error 走 `String(error)`。这保证了嵌套失败（例：`backend-controller.ts:81` 抛的 `AggregateError([error, cleanupError], 'desktop backend startup and cleanup failed')`）在界面上**两层原因都在**。

**可执行借鉴项**：Synova 的启动/停机失败聚合用 `AggregateError`，并在展示层递归展开，禁止只显示最外层一句。
**我们改到什么程度（可验收）**：构造"启动失败 + 清理也失败" → 弹窗详情同时含两条原因字符串（缺任一条即失败）。

---

## 六、⑤资源与内存

### A-20 子进程 stderr 有界环形缓冲（64KB 封顶）· `可直接复制`

```console
$ sed -n '25p;131p' apps/desktop/src/host-process.ts
const MAX_HOST_DIAGNOSTIC_CHARS = 64 * 1024
    child.stderr?.on('data', (chunk: string) => { this.stderr = (this.stderr + chunk).slice(-MAX_HOST_DIAGNOSTIC_CHARS) })
```

`host-process.ts:25,130-131`：stderr 设为 utf8，并以 `.slice(-MAX_HOST_DIAGNOSTIC_CHARS)` 保留**末尾** 64K 字符。长驻子进程可能跑数天，日志量无上限——这是防 OOM 的关键一行。日志随后只在**子进程异常退出**时拼进错误（`:153-156`）。

**可执行借鉴项**：Synova 对长驻后端/子进程的 stdout/stderr 采用有界保留（保留尾部），永不无界累积。
**我们改到什么程度（可验收）**：向子进程 stderr 灌 10MB → 父进程驻留增量 < 1MB，且错误信息保留的是**最后**一段日志（首段被丢弃）。

### A-21 定时器 `unref()`：等待不得阻止进程退出 · `可直接复制`

```console
$ sed -n '49p' apps/desktop/src/host-process.ts
    timer.unref()
```

`host-process.ts:45-56` 的 `exitsWithin(exit, ms)` 超时用的定时器在建立后立即 `unref()`，并在 `finally` 里 `clearTimeout`——**"等待子进程退出"这个等待本身不会把进程钉住**。

**可执行借鉴项**：Synova 所有"带超时的等待"里的定时器 `unref()`，避免退出时被未到时定时器挂住。
**我们改到什么程度（可验收）**：退出路径上存在一个 10s 超时等待 → 进程不因此延迟退出（退出耗时 < 1s，无需等满 10s）。

### A-22 分级终止阶梯：优雅 → SIGTERM → SIGKILL，每级各有期限，且结果可判定 · `可参照`

```console
$ sed -n '201p;203p' apps/desktop/src/host-process.ts
    if (!graceful) child.kill('SIGTERM')
      child.kill('SIGKILL')
```

`host-process.ts:194-213`：先发 IPC `shutdown`，等 **10s**（`:200`）；未退出 → `SIGTERM`（`:201`），再等 **5s**（`:202`）；仍未退出 → `SIGKILL`（`:203`），再等 **5s**（`:204`），还不退出才抛 `did not exit after SIGKILL`（`:205`）。关键在 `:209-212`：即便进程退出了，若 `requireGraceful` 且"非优雅 / exitCode ≠ 0 / 未确认 shutdown"三者任一成立，就抛 `DesktopHostUncleanExitError`——**"退出了"与"干净退出了"是两个不同结论**。

**可执行借鉴项**：Synova 停后端/子进程用同一阶梯，并区分"进程已停"与"干净停下"；不干净时拒绝进入需要一致性的下一步（如热替换）。
**我们改到什么程度（可验收）**：注入忽略 SIGTERM 的子进程 → 最终被 SIGKILL 且父进程记录阶梯各段耗时；注入"退出码非 0 但确实退出" → 报不干净，**不**继续进行下一阶段。

### A-23 对话框集合用 `AbortController` 统一撤销（释放与状态切换）· `可参照`

```console
$ sed -n '213p;744p' apps/desktop/src/main.ts
    const controller = new AbortController()
        for (const controller of ordinaryDialogs) controller.abort()
```

`main.ts:207,212-220`：普通弹窗统一进 `ordinaryDialogs: Set<AbortController>`，`finally` 里移除；`main.ts:743-746`：一旦进入强制更新阻塞态，**遍历集合 abort 掉全部普通弹窗**并取消更新对话框。好处是"多个并发提示"不会在状态跃迁后残留。

**可执行借鉴项**：Synova 前端/主进程的并发提示统一登记并可被一次状态跃迁整体撤销。
**我们改到什么程度（可验收）**：并发打开 3 个提示后触发阻塞态 → 3 个全部关闭、集合长度归 0（无泄漏）。

---

## 七、⑥打包与签名

> 本面结论属**发布态**，补充引用了 `.app`（0.15.7）与构建脚本；源码仍为 `dsh-v0.1.6-alpha.2`。

### A-24 未签名构建被显式限制在 Windows（失败要响）· `可直接复制`

```console
$ sed -n '52p' apps/desktop/scripts/electron-builder-config.mjs
  if (unsigned && resolvedPlatform !== 'win32') throw new Error('desktop package: unsigned builds require Windows')
```

（`DSH_DESKTOP_UNSIGNED === '1'` 见 `:51`。）**不允许"以为在签名其实没签"**：非 Windows 要未签名构建必须显式开开关，否则直接抛错停构建。

**可执行借鉴项**：Synova 打包脚本把"未签名/已签名"做成显式开关，并在不支持未签名的平台**硬失败**而非静默产出裸包。
**我们改到什么程度（可验收）**：`UNSIGNED=1` 打 macOS → 构建以非 0 退出并打印该错误；不带开关打 macOS → 构建产物通过 `codesign --verify`。

### A-25 macOS：`hardenedRuntime` + `notarize` + 预签名子树 `signIgnore` · `可参照`

```console
$ sed -n '126p;129p' apps/desktop/scripts/electron-builder-config.mjs
      hardenedRuntime: true,
      notarize: true,
```

配套：`:125` `forceCodeSigning: true`、`:128` `signIgnore`（对已预签名的 `app.asar.unpacked/dsh` 与 `runtime/primary-runtime` 子树、以及 `.pak` 资源不做二次签名——注释 `:127` 说明 PAK 由外层 bundle 封签）、`:130` 目标 `['dmg','zip']`、`:170-174` 对 DMG 再做公证。

**可执行借鉴项**：Synova 若走 macOS 分发，签名策略需一次性定好"哪些子树预签名 / 由谁封签"，并开启 hardenedRuntime + notarize；否则公证必然失败。
**我们改到什么程度（可验收）**：`codesign --verify --deep --strict` 通过 + `spctl -a -t exec` 通过 + 首次启动无 Gatekeeper 拦截。

### A-26 签名后**立即验签**（afterSign，fail-closed）· `可直接复制`

```console
$ sed -n '166p' apps/desktop/scripts/electron-builder-config.mjs
      verifyMacOSSignatureAfterSign(context, macOSSigning ?? resolveMacOSSigningEnvironment(env))
```

`afterSign` 钩子（`:159-167`）在 darwin 上：先 `verifyMacOSAppUpdateConfig`（`:165`，校验写进包内的更新源配置一致），再验签。**签名不是"打完就算"，要有独立的验证步骤，且验证失败即失败**。

**可执行借鉴项**：Synova 打包流水线在签名后加独立验签步骤（含包内更新配置一致性），验证失败即中断。
**我们改到什么程度（可验收）**：人为破坏签名或改坏 `app-update.yml` → 构建失败并指出是哪一项校验失败。

### A-27 Windows：`forceCodeSigning` + `sha256` 摘要 + 发布者一致性 · `可直接复制`

```console
$ sed -n '178p' apps/desktop/scripts/electron-builder-config.mjs
      forceCodeSigning: !unsigned,
```

（`signtoolOptions` 见 `:179-183`，含 `publisherName: resolveWindowsUpdatePublisher(...)` 与 `signingHashAlgorithms: ['sha256']`。）

**可执行借鉴项**：Synova 的 Windows 包强制签名 + sha256，且签名发布者名与更新包发布者**同源取值**（否则自动更新会被拒）。
**我们改到什么程度（可验收）**：`Get-AuthenticodeSignature` 为 Valid 且 Subject 与更新配置里的发布者一致。

### A-28 随包运行时树做 sha256 完整性清单 · `可参照`

```console
$ sed -n '77p' apps/desktop/src/runtime-tree.ts
  return { path: name, bytes: body.byteLength, sha256: createHash('sha256').update(body).digest('hex'),
```

`runtime-tree.ts:21-26` 定义 `DesktopRuntimeFile { path, bytes, sha256, executable }`；`:77-79` 逐文件算 sha256 与可执行位；`:29-37` 的 `DesktopRuntimeDescriptor` 把 release 版本、platform、arch、共享包清单与文件清单一起记录到根描述符 `desktop-runtime.json`（`:12-13`）。

**可执行借鉴项**：Synova 随包运行时（node 运行时 / engine-core 产物）生成条目级 sha256 清单，启动或升级时可校验"这份运行时到底是不是这套包"。
**我们改到什么程度（可验收）**：篡改运行时任一文件 → 校验报红并指名文件路径；清单缺失 → 启动降级并显式 `degraded`（不是静默继续）。

---

## 八、⑦自动更新

### A-29 下载与安装**分离**，两次都由用户授权 · `可直接复制`

```console
$ sed -n '65,66p' apps/desktop/src/update-coordinator.ts
    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = false
```

`update-coordinator.ts:65-70` 一次性关掉"自动下载"和"退出时自动安装"。下载与安装是**两个独立 API**（`:99` `download(version)` 与 `:125` `install(version)`），且 `main.ts:390-396` 明写"Only a completed user-driven download opens this prompt"。

**可执行借鉴项**：Synova 桌面端更新：可自动**检查**，但下载与安装必须分别经用户确认；退出应用不得顺手安装。
**我们改到什么程度（可验收）**：只有检查是自动的；不点"下载"则无流量（抓包 0 字节更新流量）；点下载后关闭应用 → 版本号不变。

### A-30 `allowDowngrade = false`（并点明 channel 会打开降级）· `可直接复制`

```console
$ sed -n '70p' apps/desktop/src/update-coordinator.ts
    this.updater.allowDowngrade = false
```

（`:67-69` 设 `channel='nightly'`、`allowPrerelease=true`；注释紧邻解释"Selecting a channel can enable downgrade in electron-updater."）

**可执行借鉴项**：Synova 显式关闭降级，并用 `gt(version, current)` 自行判定"是否更新"（`:186`），不依赖上游语义。
**我们改到什么程度（可验收）**：把 feed 指向一个**更低**版本 → 状态停在 `idle`，不出现可下载项（可写成单测）。

### A-31 安装授权**版本绑定**：只认自己确认过的那个版本 · `可直接复制`

```console
$ sed -n '127p' apps/desktop/src/update-coordinator.ts
    if (!this.downloaded || this.downloadOperation !== undefined || version !== this.candidate) throw new Error('desktop update: confirmed target is not ready')
```

`update-coordinator.ts:125-141` 的 `install(version)` 三重前置：已下载 + 无并发下载 + **`version === this.candidate`**；`:106` 下载侧也校验 `version !== this.candidate` 即拒（"download confirmation is stale"）。配合 `ipc.ts:53` 的原则"产品文档不能提供更新版本号/包 URL/安装授权"——**渲染层递上来的 version 只是"回显确认"，权威值始终在主进程**。

**可执行借鉴项**：Synova 升级授权做成"主进程持有候选项 + 渲染层只回显确认"，版本错位（TOCTOU）直接拒绝。
**我们改到什么程度（可验收）**：下载 0.15.8 后，把确认请求的版本改成 0.15.9 → 抛 `confirmed target is not ready`，不安装。

### A-32 更新前"活动任务闸"：inspect → 用户确认 → lock → 停后端 → 接管退出 · `可参照`

```console
$ sed -n '348p;366p;371p;376p' apps/desktop/src/main.ts
      const active = await host.updateTasks('inspect')
        const stillActive = await host.updateTasks('lock')
        await backend.stop()
        updateJournal?.action('install-confirmed')
```

`main.ts:341-386` 的安装前流程是本件**最值得 Synova 抄的编排**：
1. `:344-345` 先等 `workspaceRecovery` 与 `startup` 落定（不在启动中途换版本）。
2. `:346-347` 拿不到 host → 抛 `tasks-unavailable`（**不是**默认放行）。
3. `:348` `inspect`（只读）→ 决定文案："有活跃任务（warning）/ 已下载（info）"。
4. `:357-363` 强制更新走 `mandatoryUI.confirm`，普通更新走主进程弹窗；**取消即中止**。
5. `:365-367` 再 `lock`，且**复核锁前后活跃态是否变化**（`stillActive && !active` → `tasks-changed` 拒绝）——防 TOCTOU。
6. `:369-375` `requireCleanStop = true` → `backend.stop()` → 若为不干净退出（见 A-22）→ 抛 `stop-failed`。
7. `:376-377` 记 `install-confirmed`、置 `shellInstallerOwnsQuit`（此后 `before-quit` 交给安装器放行，`:702-706`）。
8. `:378-383` 任何异常：若还没停后端 → `unlock` 恢复准入，`finally` 复位 `requireCleanStop`。
9. `:297-319` 安装失败且已停后端 → **自动重启后端并重新导航**（把用户放回可用状态）。

**可执行借鉴项**：Synova 任何"需要停机才能做的替换/迁移/重启"，按同一九步编排：等落定 → 读态 → 确认 → 锁 → 复核 → 干净停 → 接管 → 异常恢复准入 → 失败自动回恢复。
**我们改到什么程度（可验收）**：诊断运行中发起升级 → 提示"有活跃任务"且必须二次确认；确认后锁期间新请求 503；停止后端失败 → 版本不变、后端自动拉起、界面回到可用（不出现白屏死锁）。

---

## 九、⑧离线 / 弱网

### A-33 **空闲超时**（而非总超时）+ 参数范围校验 + 主动 abort · `可直接复制`

```console
$ sed -n '13p;36p' apps/desktop/src/update-http-executor.ts
    if (!Number.isSafeInteger(idleTimeoutMs) || idleTimeoutMs < 1000 || idleTimeoutMs > 2_147_483_647) {
        reject(Object.assign(new Error('Desktop update connection timed out'), { code: 'ETIMEDOUT' }))
```

`update-http-executor.ts:11-16`：超时值必须是 1000 ~ 2 147 483 647 的整数，否则**构造即抛**；文件头注释明确定义语义——"Maximum silence before headers or between response chunks, **not a total download deadline**"（是**空闲**超时，不是总时长上限）。`:32-39` 每次收到数据就 `refresh()` 重置定时器；超时则 `stop()` 解绑全部监听 → reject `ETIMEDOUT` → `request.abort()`（清理彻底，不留悬挂 socket）。`:23-31` 的 `stop()` 逐项 `off` 了 `response/abort/error/data/end`。默认值 60s（`update-coordinator.ts:60-63`，可用 `DSH_DESKTOP_UPDATE_HTTP_IDLE_TIMEOUT_MS` 覆盖）。

**可执行借鉴项**：Synova 所有对外 HTTP（LLM 网关、更新源）用**空闲超时**并对超时参数做范围校验；超时后中断请求并解绑监听。
**我们改到什么程度（可验收）**：慢速但持续有字节的大文件 → 不被超时中断；连接建立后静默 → 在空闲阈值内被中断且错误码为 `ETIMEDOUT`；传 `0` 或 `1e12` → 启动即抛参数错误。

### A-34 网络类失败与操作类失败**分离分类**（同一失败给不同文案）· `可直接复制`

```console
$ sed -n '5p;15p' apps/desktop/src/update-presentation.ts
const NETWORK_FAILURE = /\b(?:ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ETIMEDOUT)\b/u
  return NETWORK_FAILURE.test(state.message ?? '') ? `${operation}-network` : operation
```

`update-presentation.ts:12-16` 把 `failedOperation`（check/download/install）× 是否网络类 → 组合成 9 种语义（`ipc.ts:34-43`：`check`/`check-network`/`download`/`download-network`/`install`/`install-network`/`stop-failed`/`tasks-changed`/`tasks-unavailable`），再由 `:24-38` 映射到不同本地化文案。`:44-51` 的 `presentDesktopUpdate` **只输出语义**（phase/version/percent/failure），不带原始诊断、不带安装控件。

**可执行借鉴项**：Synova 对"断网"与"操作失败"给不同恢复建议（断网：稍后重试；操作失败：看诊断）；渲染层只拿语义枚举，不拿原始错误串。
**我们改到什么程度（可验收）**：断网触发检查失败 → 文案走 `*-network` 分支且**不含**原始堆栈；可控地让上游返回非网络错误 → 走非 network 分支。两条路径可分别断言。

### A-35 离线内建：应用自带文档由主进程直接服务；后端未就绪给 503 占位 · `可参照`

```console
$ sed -n '406p' apps/desktop/src/main.ts
        return Promise.resolve(new Response(null, { status: 503 }))
$ sed -n '28p' apps/desktop/src/web-document.ts
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Response(null, { status: 404 })
```

`main.ts:398-411`：自定义协议下，`/`、`/index.html`、`/assets/*`、`/favicon.svg`、`/manifest.webmanifest` **由主进程直接从随包 `dsh-web-frontend/dist` 读取**（`:403`），不经网络；其余路径在 host 未就绪时返回 **503**（而非崩溃或空白）。`web-document.ts:18-36`：路径做 `resolve` + `startsWith(root + sep)` 防穿越（`:25`）、非法百分号编码 → 400（`:22`）、非 GET/HEAD → 405（`:19`）、`ENOENT` → 404（`:28`）、按扩展名给 MIME（`:34`）、并在 `index.html` 的 `<head>` 注入 `__DSH_BOOT_READY__`（`:10,31-32`）。

**可执行借鉴项**：Synova 桌面端把"壳"（HTML/JS/CSS/图标）随包本地服务，权威数据走后端；后端未就绪时给明确的 503 占位页（含重试入口），而不是白屏。
**我们改到什么程度（可验收）**：拔网线启动 → 壳正常渲染（本地资源命中，无网络请求）；后端未起时页面出现 503 占位与重试按钮；请求 `/../../etc/passwd` → 403。

---

## 十、⑨多窗口 / 托盘

### A-36 模态覆盖窗：跟随父窗内容边界 + 关窗即解绑 + `ready-to-show` 才显示 · `可参照`

```console
$ sed -n '13p;17p;33p' apps/desktop/src/update-overlay.ts
    ...parent.getContentBounds(), resizable: false, minimizable: false, maximizable: false,
  const follow = (): void => { if (!window.isDestroyed()) window.setBounds(parent.getContentBounds()) }
  window.once('ready-to-show', () => { if (!window.isDestroyed()) window.show() })
```

`update-overlay.ts:10-37`：`parent + modal + frame:false + transparent + skipTaskbar + hasShadow:false`（`:12-14`），尺寸取父窗 `getContentBounds()`；`parent.on('move'|'resize', follow)` 跟随（`:18-19`）；`closed` 时**同时**解绑 `move/resize` 并移除注入的 `body{filter:blur(2px)}` CSS（`:22-32`，`removeInsertedCSS` 失败仅 warn 不抛）；`once('ready-to-show')` 才 `show()`（`:33`）避免白闪；`:34-35` 清菜单 + 禁开窗。`:42` 在 Windows 上改用具标题栏的原生模态（`createMandatoryUpdateWindow`）。

**可执行借鉴项**：Synova 的模态确认（危险操作、升级、删除）用"跟随父窗的覆盖层 + ready-to-show 再显示 + 关闭即解绑"，在 Windows 回退为原生模态。
**我们改到什么程度（可验收）**：拖拽/缩放父窗 → 覆盖层 1 帧内跟随（无错位）；连续开关 20 次 → 父窗 `move/resize` 监听数不增长（无泄漏）、CSS 注入条目归零；覆盖层不出现白闪。

### A-37 子窗口 IPC 归属三重校验（sender + mainFrame + url 全等）· `可直接复制`

```console
$ sed -n '107,108p' apps/desktop/src/update-dialog.ts
    if (active === undefined || event.sender !== active.window.webContents
      || event.senderFrame !== active.window.webContents.mainFrame || event.senderFrame.url !== page) {
```

`update-dialog.ts:105-112`：不仅校验"来自哪个 webContents"，还要求**是主帧**且**URL 全等于该窗口专属页面** `dsh-app://shell/update-dialog.html`（`page` 定义见 `:33`）；任一不满足即抛 `rejected unowned dialog renderer`。`update-dialog.ts:49-56` 还限制响应值只能是"已显示的选项索引"或 `cancelId`。

**可执行借鉴项**：Synova 每个子窗口的 IPC 都校验"窗口 + 主帧 + 专属 URL"，并且**只接受界面已展示过的选择项**。
**我们改到什么程度（可验收）**：从主窗口向子窗口频道发起调用 → 抛错；子窗口传入未展示的选项索引（如 99）→ 抛 `invalid dialog response`。

### A-38 托盘（Tray）面：**官方无实现** · `官方无实现`（CTO 裁定：本面不计入借鉴项计数）

```console
$ git grep -cw -- "Tray" | wc -l
       0
$ grep -rni "tray" apps/desktop/src/ apps/desktop-host/src/ | wc -l
       0
```

官方参照系中 **Tray（托盘）零实现**：既没有 `Tray` 类使用，也没有 `nativeImage` 托盘图标、托盘菜单、最小化到托盘、关闭到托盘等任何形态（Electron 主/宿主源码 `tray` 命中 0）。多窗口面官方只做了"主窗 + 模态子窗"，**常驻托盘/快捷键唤起/后台驻留入口均无官方对应物**。

**我方自研方案（明标自研，不得计入借鉴项）**：
1. 托盘常驻：`Tray` + `nativeImage` 模板图（macOS 用 `setTemplateImage`），菜单项 = `打开主窗 / 暂停哨兵 / 立即检查更新 / 退出`。
2. 关闭语义分级：`Cmd/Ctrl+W` = 隐到托盘（`window.hide()`），`Cmd/Ctrl+Q` / 菜单退出 = 走完整 `before-quit` 清理链（对齐 A-03）。
3. 与单实例锁（A-01）配合：第二实例 → 托盘恢复主窗。
4. 平台差异：macOS 托盘点击默认行为与 Windows 双击行为不同，需显式定义；托盘不可用（无图形会话）时必须降级为普通窗口并显式 `degraded`，不得静默无入口。
**我们改到什么程度（可验收）**：关窗后进程仍在（托盘图标存在）且哨兵继续跑；从托盘"暂停哨兵"→ 5s 内无新哨兵运行；托盘"退出"→ 走完整清理且 `ps` 中无残留进程；无托盘环境启动 → 有明确日志与降级标记（`degraded: true`）。

---

## 十一、借鉴项汇总（39 条：37 条计入三分类 + 2 条官方无实现单列；配额 ≥12）

| ID | 标题 | 分类 | 面 | 官方 file:line |
|---|---|---|---|---|
| A-01 | 单实例锁先于 profile 生命周期 | 可直接复制 | ①启动 | `apps/desktop/src/single-instance.ts:20`、`apps/desktop/src/main.ts:774` |
| A-02 | 单入口 whenReady + 致命失败落盘 | 可直接复制 | ①启动 | `apps/desktop/src/main.ts:776`、`:779` |
| A-03 | 退出状态机 preventDefault→清理→quit | 可参照 | ①启动 | `apps/desktop/src/main.ts:699`、`:708`、`:715` |
| A-04 | shuttingDown / quitting 双标志 | 可参照 | ①启动 | `apps/desktop/src/main.ts:45`、`:193` |
| A-05 | 安全三件套硬基线 | 可直接复制 | ②IPC | `apps/desktop/src/main.ts:136`、`:137`、`:138` |
| A-06 | IPC 频道常量化 | 可直接复制 | ②IPC | `apps/desktop/src/ipc.ts:6`、`:7` |
| A-07 | 产品 API 面最小化 + protocolVersion | 可直接复制 | ②IPC | `apps/desktop/src/ipc.ts:54`（边界注释 `:53`） |
| A-08 | 来源协议+主机白名单校验 | 可直接复制 | ②IPC | `apps/desktop/src/ipc.ts:71` |
| A-09 | 拥有窗口 + 主帧二次校验 | 可直接复制 | ②IPC | `apps/desktop/src/main.ts:228`、`:229` |
| A-10 | 导航与新窗口全封闭 | 可直接复制 | ②IPC | `apps/desktop/src/main.ts:142`、`:173`、`:178` |
| A-11 | 自定义协议 privileged + codeCache | 可参照 | ②IPC | `apps/desktop/src/main.ts:70`、`:78` |
| A-12 | preload 按 origin 分级 + stub 降级 | 可直接复制 | ②IPC | `apps/desktop/src/preload-app.ts:22`、`:36` |
| A-13 | 唤醒/回前台即补检 + 退出反注册 | 可直接复制 | ③长驻 | `apps/desktop/src/main.ts:571`、`:574`（另 `:661`） |
| A-14 | 完成式截止+指数退避+抖动+单调时钟 | 可直接复制 | ③长驻 | `apps/desktop/src/update-schedule.ts:102`、`:106` |
| A-15 | 停机前准入闸：锁→排空→再检查 | 可参照 | ③长驻 | `apps/desktop-host/src/update-tasks.ts:40`、`:45`、`:46` |
| A-16 | 省电挂起（suspend/阻止休眠）**官方无实现** | 核心自研 | ③长驻 | （官方无实现） |
| A-17 | 首错去重 + 三档恢复 + 可重入 | 可参照 | ④崩溃 | `apps/desktop/src/fatal-recovery.ts:40`、`:52`、`:53`、`:54` |
| A-18 | 渲染三线统一归口 reportFatal | 可直接复制 | ④崩溃 | `apps/desktop/src/main.ts:665`、`:669`、`:674` |
| A-19 | AggregateError 递归展开 | 可直接复制 | ④崩溃 | `apps/desktop/src/startup-error.ts:11` |
| A-20 | stderr 有界环形缓冲 64KB | 可直接复制 | ⑤资源 | `apps/desktop/src/host-process.ts:25`、`:131` |
| A-21 | 等待用定时器 unref | 可直接复制 | ⑤资源 | `apps/desktop/src/host-process.ts:49` |
| A-22 | 分级终止阶梯 + 干净退出判定 | 可参照 | ⑤资源 | `apps/desktop/src/host-process.ts:201`、`:203`、`:209-212` |
| A-23 | 弹窗集合 AbortController 统一撤销 | 可参照 | ⑤资源 | `apps/desktop/src/main.ts:213`、`:744` |
| A-24 | 未签名构建限制在 Windows 且硬失败 | 可直接复制 | ⑥打包 | `apps/desktop/scripts/electron-builder-config.mjs:52` |
| A-25 | mac hardenedRuntime+notarize+signIgnore | 可参照 | ⑥打包 | `apps/desktop/scripts/electron-builder-config.mjs:126`、`:129` |
| A-26 | 签名后独立验签（fail-closed） | 可直接复制 | ⑥打包 | `apps/desktop/scripts/electron-builder-config.mjs:166` |
| A-27 | win forceCodeSigning + sha256 | 可直接复制 | ⑥打包 | `apps/desktop/scripts/electron-builder-config.mjs:178` |
| A-28 | 运行时树 sha256 完整性清单 | 可参照 | ⑥打包 | `apps/desktop/src/runtime-tree.ts:77` |
| A-29 | 下载/安装分离，双授权 | 可直接复制 | ⑦更新 | `apps/desktop/src/update-coordinator.ts:65`、`:66` |
| A-30 | allowDowngrade=false | 可直接复制 | ⑦更新 | `apps/desktop/src/update-coordinator.ts:70` |
| A-31 | 安装授权版本绑定（拒绝 TOCTOU） | 可直接复制 | ⑦更新 | `apps/desktop/src/update-coordinator.ts:127` |
| A-32 | 更新前活动任务闸九步编排 | 可参照 | ⑦更新 | `apps/desktop/src/main.ts:348`、`:366`、`:371`、`:376` |
| A-33 | 空闲超时 + 参数校验 + 主动 abort | 可直接复制 | ⑧离线 | `apps/desktop/src/update-http-executor.ts:13`、`:36` |
| A-34 | 网络 vs 操作失败分离分类 | 可直接复制 | ⑧离线 | `apps/desktop/src/update-presentation.ts:5`、`:15` |
| A-35 | 离线内建壳 + 后端未就绪 503 占位 | 可参照 | ⑧离线 | `apps/desktop/src/main.ts:406`、`apps/desktop/src/web-document.ts:28` |
| A-36 | 模态覆盖窗跟随父窗/即解绑/ready-to-show | 可参照 | ⑨多窗 | `apps/desktop/src/update-overlay.ts:13`、`:17`、`:33` |
| A-37 | 子窗口 IPC 三重归属校验 | 可直接复制 | ⑨多窗 | `apps/desktop/src/update-dialog.ts:107`、`:108` |
| A-38 | 托盘（Tray）**官方无实现** → 我方自研 | 核心自研 | ⑨多窗/托盘 | （官方无实现） |
| A-39 | 长驻事件日志 JSONL + 白名单字段落盘 | 可参照 | ③④ | `apps/desktop/src/update-journal.ts:20-31`、`:63-65`、`:71-72` |

**计数**：39 条（其中 A-16 与 A-38 两条为「官方无实现 → 我方自研」，按要求单列；**计入借鉴项计数的 = 37 条**）。

### 九面覆盖表（A 判据）

| 面 | 官方 file:line（至少一条） | 借鉴项 ID | 是否满足 ≥1 |
|---|---|---|---|
| ①启动时序与生命周期 | `apps/desktop/src/main.ts:776` | A-01~A-04 | ✅ |
| ②主-渲染边界与 IPC 契约 | `apps/desktop/src/ipc.ts:71` | A-05~A-12 | ✅ |
| ③长驻与省电挂起 | `apps/desktop/src/main.ts:571` | A-13~A-16 | ✅ |
| ④崩溃恢复与重启 | `apps/desktop/src/fatal-recovery.ts:40` | A-17~A-19 | ✅ |
| ⑤资源与内存 | `apps/desktop/src/host-process.ts:131` | A-20~A-23 | ✅ |
| ⑥打包与签名 | `apps/desktop/scripts/electron-builder-config.mjs:126` | A-24~A-28 | ✅ |
| ⑦自动更新 | `apps/desktop/src/update-coordinator.ts:65` | A-29~A-32 | ✅ |
| ⑧离线/弱网 | `apps/desktop/src/update-http-executor.ts:36` | A-33~A-35 | ✅ |
| ⑨多窗口/托盘 | `apps/desktop/src/update-overlay.ts:13` / 托盘（官方无实现） | A-36~A-38 | ✅（8 面有官方 file:line + 托盘面明标无实现） |

---

## 十二、全量 file:line 自检（100% 覆盖，非抽样）

本件全部官方引用的逐行复现。命令形式（heredoc 内容即下表的 `文件:行号` 清单，逐行喂入）：

```bash
cd /Users/wane/src/deepseek-harness && while IFS= read -r spec; do
  f="${spec%:*}"; l="${spec##*:}"
  printf '%-52s | %s\n' "$spec" "$(sed -n "${l}p" "$f")"
done <<'EOF'
apps/desktop/src/single-instance.ts:20
...（共 39 行引用清单）
EOF
```

实际输出分两组贴出（第一组为启动/退出/IPC/长驻/任务闸，第二组为恢复/资源/打包/更新/离线/多窗）：

```
apps/desktop/src/single-instance.ts:20               |   if (!application.requestSingleInstanceLock()) {
apps/desktop/src/main.ts:774                         | const ownsDesktopInstance = claimDesktopSingleInstance(app, () => { focusPrimaryWindow() })
apps/desktop/src/main.ts:776                         | if (ownsDesktopInstance) void app.whenReady().then(main).catch(async (error: unknown) => {
apps/desktop/src/main.ts:779                         |   const diagnosticFile = process.env.DSH_DESKTOP_DIAGNOSTIC_FILE
apps/desktop/src/main.ts:699                         |   app.on('before-quit', (event) => {
apps/desktop/src/main.ts:708                         |     event.preventDefault()
apps/desktop/src/main.ts:715                         |       .catch((error: unknown) => { console.error(error) }).finally(() => { app.quit() })
apps/desktop/src/main.ts:45                          | let shuttingDown = false
apps/desktop/src/main.ts:193                         |   let quitting = false
apps/desktop/src/main.ts:136                         |       nodeIntegration: false,
apps/desktop/src/main.ts:137                         |       contextIsolation: true,
apps/desktop/src/main.ts:138                         |       sandbox: true,
apps/desktop/src/ipc.ts:6                            | export const DESKTOP_IPC = {
apps/desktop/src/ipc.ts:7                            |   boot: 'dsh-desktop:boot',
apps/desktop/src/ipc.ts:53                           | /** Product documents cannot supply update versions, package URLs, or installation authorization. */
apps/desktop/src/ipc.ts:54                           | export interface DshDesktopProductApi {
apps/desktop/src/ipc.ts:71                           | export function assertDesktopSender(event: IpcMainInvokeEvent, hostnames: readonly string[]): void {
apps/desktop/src/main.ts:228                         |     if (mainWindow === undefined || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents
apps/desktop/src/main.ts:229                         |       || event.senderFrame === null || event.senderFrame !== mainWindow.webContents.mainFrame) {
apps/desktop/src/main.ts:142                         |   window.webContents.setWindowOpenHandler(({ url }) => {
apps/desktop/src/main.ts:173                         |   window.webContents.on('will-navigate', (event, url) => {
apps/desktop/src/main.ts:178                         |       event.preventDefault()
apps/desktop/src/main.ts:70                          | protocol.registerSchemesAsPrivileged([{
apps/desktop/src/main.ts:78                          |     codeCache: true,
apps/desktop/src/preload-app.ts:22                   | if (location.protocol === `${SCHEME}:` && location.hostname === 'app') {
apps/desktop/src/preload-app.ts:36                   | contextBridge.exposeInMainWorld('dshDesktop', location.protocol === `${SCHEME}:` && location.hostname === 'app' ? product : { protocolVersion: 1 })
apps/desktop/src/main.ts:571                         |   powerMonitor.on('resume', automaticCheck)
apps/desktop/src/main.ts:574                         |     powerMonitor.off('resume', automaticCheck)
apps/desktop/src/main.ts:661                         |     window.on('focus', automaticCheck)
apps/desktop/src/update-schedule.ts:102              |     this.delay = failed ? Math.min(maxBackoffMs, this.delay * 2) : intervalMs
apps/desktop/src/update-schedule.ts:106              |     this.nextCheck = this.now() + delay
apps/desktop-host/src/update-tasks.ts:40             |       await Promise.all(pendingRequests)
apps/desktop-host/src/update-tasks.ts:45             |     const liveAgents = agents.list()
apps/desktop-host/src/update-tasks.ts:46             |     return liveAgents.some(agent => agent.status === 'running'
```

实际输出（第二组）：
```
apps/desktop/src/fatal-recovery.ts:40                    |     if (this.reported) return
apps/desktop/src/fatal-recovery.ts:52                    |         buttons: addressInUse
apps/desktop/src/fatal-recovery.ts:53                    |           ? [messages.exitApplication, messages.restartApplication]
apps/desktop/src/fatal-recovery.ts:54                    |           : [messages.exitApplication, messages.restartApplication, messages.disableThirdPartyPlugins],
apps/desktop/src/main.ts:665                             |         reportFatal(new Error(`Desktop page failed to load: ${url} (${String(code)}: ${description})`))
apps/desktop/src/main.ts:669                             |       if (!quitting && !window.isDestroyed()) reportFatal(error)
apps/desktop/src/main.ts:674                             |         reportFatal(new Error(`Desktop renderer exited: ${details.reason}`))
apps/desktop/src/startup-error.ts:11                     |     : error instanceof Error ? error.message : String(error)
apps/desktop/src/host-process.ts:25                      | const MAX_HOST_DIAGNOSTIC_CHARS = 64 * 1024
apps/desktop/src/host-process.ts:131                     |     child.stderr?.on('data', (chunk: string) => { this.stderr = (this.stderr + chunk).slice(-MAX_HOST_DIAGNOSTIC_CHARS) })
apps/desktop/src/host-process.ts:49                      |     timer.unref()
apps/desktop/src/host-process.ts:201                     |     if (!graceful) child.kill('SIGTERM')
apps/desktop/src/host-process.ts:203                     |       child.kill('SIGKILL')
apps/desktop/src/main.ts:213                             |     const controller = new AbortController()
apps/desktop/src/main.ts:744                             |         for (const controller of ordinaryDialogs) controller.abort()
apps/desktop/scripts/electron-builder-config.mjs:52      |   if (unsigned && resolvedPlatform !== 'win32') throw new Error('desktop package: unsigned builds require Windows')
apps/desktop/scripts/electron-builder-config.mjs:126     |       hardenedRuntime: true,
apps/desktop/scripts/electron-builder-config.mjs:129     |       notarize: true,
apps/desktop/scripts/electron-builder-config.mjs:166     |       verifyMacOSSignatureAfterSign(context, macOSSigning ?? resolveMacOSSigningEnvironment(env))
apps/desktop/scripts/electron-builder-config.mjs:178     |       forceCodeSigning: !unsigned,
apps/desktop/src/runtime-tree.ts:77                      |   return { path: name, bytes: body.byteLength, sha256: createHash('sha256').update(body).digest('hex'),
apps/desktop/src/update-coordinator.ts:65                |     this.updater.autoDownload = false
apps/desktop/src/update-coordinator.ts:66                |     this.updater.autoInstallOnAppQuit = false
apps/desktop/src/update-coordinator.ts:70                |     this.updater.allowDowngrade = false
apps/desktop/src/update-coordinator.ts:127               |     if (!this.downloaded || this.downloadOperation !== undefined || version !== this.candidate) throw new Error('desktop update: confirmed target is not ready')
apps/desktop/src/main.ts:348                             |       const active = await host.updateTasks('inspect')
apps/desktop/src/main.ts:366                             |         const stillActive = await host.updateTasks('lock')
apps/desktop/src/main.ts:371                             |         await backend.stop()
apps/desktop/src/main.ts:376                             |         updateJournal?.action('install-confirmed')
apps/desktop/src/update-http-executor.ts:13              |     if (!Number.isSafeInteger(idleTimeoutMs) || idleTimeoutMs < 1000 || idleTimeoutMs > 2_147_483_647) {
apps/desktop/src/update-http-executor.ts:36              |         reject(Object.assign(new Error('Desktop update connection timed out'), { code: 'ETIMEDOUT' }))
apps/desktop/src/update-presentation.ts:5                | const NETWORK_FAILURE = /\b(?:ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ETIMEDOUT)\b/u
apps/desktop/src/update-presentation.ts:15               |   return NETWORK_FAILURE.test(state.message ?? '') ? `${operation}-network` : operation
apps/desktop/src/main.ts:406                             |         return Promise.resolve(new Response(null, { status: 503 }))
apps/desktop/src/web-document.ts:28                      |     if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Response(null, { status: 404 })
apps/desktop/src/update-overlay.ts:13                    |     ...parent.getContentBounds(), resizable: false, minimizable: false, maximizable: false,
apps/desktop/src/update-overlay.ts:17                    |   const follow = (): void => { if (!window.isDestroyed()) window.setBounds(parent.getContentBounds()) }
apps/desktop/src/update-overlay.ts:33                    |   window.once('ready-to-show', () => { if (!window.isDestroyed()) window.show() })
apps/desktop/src/update-dialog.ts:107                    |     if (active === undefined || event.sender !== active.window.webContents
apps/desktop/src/update-dialog.ts:108                    |       || event.senderFrame !== active.window.webContents.mainFrame || event.senderFrame.url !== page) {
```

### 引用点检查（"接线了"≠"被执行"：给引用点，不只给字符串存在）

```console
$ git grep -n "ipcMain.handle" -- 'apps/*'
apps/desktop/src/directory-picker.ts:12:  ipcMain.handle(DESKTOP_IPC.directoryPick, async (event) => {
apps/desktop/src/main.ts:415:  ipcMain.handle(DESKTOP_IPC.boot, async (event) => {
apps/desktop/src/main.ts:422:  ipcMain.handle(DESKTOP_IPC.bootFailed, (event, message: unknown) => {
apps/desktop/src/main.ts:449:  ipcMain.handle(DESKTOP_IPC.updatesStatus, (event) => {
apps/desktop/src/main.ts:453:  ipcMain.handle(DESKTOP_IPC.updatesOpen, async (event) => {
apps/desktop/src/main.ts:610:    ipcMain.handle(DESKTOP_IPC.windowsMenu, (event, name: unknown, x: unknown, y: unknown) => {
apps/desktop/src/mandatory-update-window.ts:66:    ipcMain.handle(MANDATORY_IPC.status, (event) => { this.assertSender(event); return this.view() })
apps/desktop/src/mandatory-update-window.ts:67:    ipcMain.handle(MANDATORY_IPC.action, (event, action: unknown, version: unknown, confirmationRevision: unknown) => {
apps/desktop/src/update-dialog.ts:48:    ipcMain.handle(UPDATE_DIALOG_IPC.status, event => this.owned(event).view)
apps/desktop/src/update-dialog.ts:49:    ipcMain.handle(UPDATE_DIALOG_IPC.respond, (event, index: unknown) => {
```

即 A-06/A-08/A-09 描述的"频道常量化 + 发送方校验"，在**10 个 handler 上全部落实**（10/10 命中常量引用，非字面量散落）。

### 机器可读块自身的解析校验（39 条 `official` 字段逐条落到官方树）

不只要正文的引用可复现，**JSON 块里的 `official` 字段也必须指向真实存在的文件与行**。逐条解析并 `sed` 取行：

```bash
python3 - <<'PY'   # 从本文件抽出最后一个 json 块，逐条 open(file).split('\n')[line-1]
PY
```

输出（`BAD` 行是失败清单）：

```
A-01  apps/desktop/src/single-instance.ts:20                     | if (!application.requestSingleInstanceLock()) {
A-02  apps/desktop/src/main.ts:776                               | if (ownsDesktopInstance) void app.whenReady().then(main).catch(async (error: unk
A-03  apps/desktop/src/main.ts:699                               | app.on('before-quit', (event) => {
A-04  apps/desktop/src/main.ts:45                                | let shuttingDown = false
A-05  apps/desktop/src/main.ts:136                               | nodeIntegration: false,
A-06  apps/desktop/src/ipc.ts:6                                  | export const DESKTOP_IPC = {
A-07  apps/desktop/src/ipc.ts:54                                 | export interface DshDesktopProductApi {
A-08  apps/desktop/src/ipc.ts:71                                 | export function assertDesktopSender(event: IpcMainInvokeEvent, hostnames: readon
A-09  apps/desktop/src/main.ts:228                               | if (mainWindow === undefined || mainWindow.isDestroyed() || event.sender !== mai
A-10  apps/desktop/src/main.ts:142                               | window.webContents.setWindowOpenHandler(({ url }) => {
A-11  apps/desktop/src/main.ts:70                                | protocol.registerSchemesAsPrivileged([{
A-12  apps/desktop/src/preload-app.ts:22                         | if (location.protocol === `${SCHEME}:` && location.hostname === 'app') {
A-13  apps/desktop/src/main.ts:571                               | powerMonitor.on('resume', automaticCheck)
A-14  apps/desktop/src/update-schedule.ts:102                    | this.delay = failed ? Math.min(maxBackoffMs, this.delay * 2) : intervalMs
A-15  apps/desktop-host/src/update-tasks.ts:40                   | await Promise.all(pendingRequests)
A-17  apps/desktop/src/fatal-recovery.ts:40                      | if (this.reported) return
A-18  apps/desktop/src/main.ts:665                               | reportFatal(new Error(`Desktop page failed to load: ${url} (${String(code)}: ${d
A-19  apps/desktop/src/startup-error.ts:11                       | : error instanceof Error ? error.message : String(error)
A-20  apps/desktop/src/host-process.ts:25                        | const MAX_HOST_DIAGNOSTIC_CHARS = 64 * 1024
A-21  apps/desktop/src/host-process.ts:49                        | timer.unref()
A-22  apps/desktop/src/host-process.ts:201                       | if (!graceful) child.kill('SIGTERM')
A-23  apps/desktop/src/main.ts:213                               | const controller = new AbortController()
A-24  apps/desktop/scripts/electron-builder-config.mjs:52        | if (unsigned && resolvedPlatform !== 'win32') throw new Error('desktop package: 
A-25  apps/desktop/scripts/electron-builder-config.mjs:126       | hardenedRuntime: true,
A-26  apps/desktop/scripts/electron-builder-config.mjs:166       | verifyMacOSSignatureAfterSign(context, macOSSigning ?? resolveMacOSSigningEnviro
A-27  apps/desktop/scripts/electron-builder-config.mjs:178       | forceCodeSigning: !unsigned,
A-28  apps/desktop/src/runtime-tree.ts:77                        | return { path: name, bytes: body.byteLength, sha256: createHash('sha256').update
A-29  apps/desktop/src/update-coordinator.ts:65                  | this.updater.autoDownload = false
A-30  apps/desktop/src/update-coordinator.ts:70                  | this.updater.allowDowngrade = false
A-31  apps/desktop/src/update-coordinator.ts:127                 | if (!this.downloaded || this.downloadOperation !== undefined || version !== this
A-32  apps/desktop/src/main.ts:348                               | const active = await host.updateTasks('inspect')
A-33  apps/desktop/src/update-http-executor.ts:13                | if (!Number.isSafeInteger(idleTimeoutMs) || idleTimeoutMs < 1000 || idleTimeoutM
A-34  apps/desktop/src/update-presentation.ts:5                  | const NETWORK_FAILURE = /\b(?:ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_INT
A-35  apps/desktop/src/main.ts:406                               | return Promise.resolve(new Response(null, { status: 503 }))
A-36  apps/desktop/src/update-overlay.ts:13                      | ...parent.getContentBounds(), resizable: false, minimizable: false, maximizable:
A-37  apps/desktop/src/update-dialog.ts:107                      | if (active === undefined || event.sender !== active.window.webContents
A-39  apps/desktop/src/update-journal.ts:20                      | export function desktopUpdateJournalState(state: DesktopUpdateState): object {

total: 39 | no-impl: ['A-16', 'A-38'] | BAD: []
```

**结果**：39 条中 37 条解析到真实文件+行（内容与断言吻合），2 条为 A-16/A-38 的「（官方无实现）」无需解析，**失败 0 条**。

### 本件红线自检（在 D870 工作树内执行）

```console
$ cd /Users/wane/SynovaAgent/.synova-wt-d870 && grep -rn "@deepseek-ai" src/ packages/ 2>/dev/null | wc -l
       0
$ git -C /Users/wane/SynovaAgent/.synova-wt-d870 status --porcelain
?? task-state/D870.json
```

G1 = 0 成立。`task-state/D870.json` 为本件开工前既存且非本件产出的未跟踪文件（本件未创建/未修改它）；本件唯一写入文件为 `docs/synova/research/official-electron-kernel-runtime.md`。

---

## 十三、未覆盖 / 存疑项（如实列）

1. **托盘面（A-38）无官方对应物**：按 CTO 裁定不计入借鉴项计数，仅给自研方案（§十）。Synova 托盘实现无参照，需自研立项。
2. **省电挂起（A-16）官方半实现**：官方只有 `resume` 监听，无 `suspend` 落盘、无 `powerSaveBlocker`。我方"挂起落盘 + 续跑"方案为自研，官方不能提供实现参照。
3. **密度口径偏差未定因**：派单件 `BrowserWindow 77 / electron-updater 22 / requestSingleInstanceLock 6` 三值与本件三口径（tracked 行 63/23/5、tracked 出现次数 69/24/5、含构建产物行 93/—/—）均不重合，成因**未查明**。本件已改用 tracked 行口径并逐行复现（§十二），但**该偏差本身未闭环**。
4. **仅覆盖 macOS/Windows 发布态证据**：`.app` 断面与签名/公证证据取自本机 macOS 安装（0.15.7）；Windows 侧（NSIS、signtool）**只有构建脚本证据，无本机实测断面**——A-27 的"实际签名有效"未在本机验证。
5. **`apps/desktop/src` 共 41 个 .ts，本件精读 20 个**（main/ipc/preload-app/single-instance/fatal-recovery/startup-error/host-process/backend-controller/directory-picker/update-coordinator/update-schedule/update-http-executor/update-presentation/update-error/update-journal/update-dialog/update-overlay/web-document/windows-layout/runtime-tree）。未精读：`locale.ts`、`mandatory-update-*.ts`（3 个）、`policy-test-auth.ts`、`node-environment.ts`、`owned-directory.ts`、`profile-*.ts`、`project-manager.ts`、`release.ts`、`core-package-set.ts`、`preload-menu/platform/theme/windows/update-dialog/mandatory.ts`、`update-attention.ts`、`update-schedule` 之外的 `update-*.ts` 余项。**这些文件可能包含本件未登记的借鉴项**（尤其 `mandatory-update-policy.ts` 的强制更新策略、`locale.ts` 的本地化机制）。
6. **本件所有"我们改到什么程度"均为验收口径设计，未在 Synova 侧实现或验证**。本件不产生任何 Synova 代码改动。
7. **官方测试资产未展开**：`apps/desktop/tests/` 有 75 个 `*.spec.ts`，本件只在 A-16 反向举证时引用了测试夹具 2 处；其测试手法（如 `main-startup.spec.ts` 的依赖注入夹具）本身可能是高价值借鉴项，**未纳入本次 39 条**。

---

## 十四、机器可读块（供总表机械聚合）

```json
{"d870_borrow_items":[
{"id":"A-01","title":"单实例锁先于 profile 生命周期","class":"可直接复制","official":"apps/desktop/src/single-instance.ts:20","action":"在 Synova 桌面端 main.ts 顶层、一切初始化之前抢 requestSingleInstanceLock；抢不到即 quit，第二实例只唤起既有窗口","scope_for_us":"双击第二次启动后主进程数=1、SQLite 写入者=1；第二实例 500ms 内以 exit 0 退出且第一实例窗口获焦"},
{"id":"A-02","title":"单入口 whenReady + 致命失败落盘","class":"可直接复制","official":"apps/desktop/src/main.ts:776","action":"app.whenReady().then(main) 作为唯一入口；启动失败先把栈写入约定诊断文件（写盘失败不掩盖原始错误）再上报","scope_for_us":"人为启动抛错→诊断文件含栈；诊断目录不可写→仍以非 0 退出码退出并打印原始错误"},
{"id":"A-03","title":"退出状态机 preventDefault→清理→quit","class":"可参照","official":"apps/desktop/src/main.ts:699","action":"before-quit 中 preventDefault → 先 hide 窗口 → dispose 各组件 → 等待后端 close → finally 调 app.quit","scope_for_us":"关窗≤1 帧消失；退出前 sentinel/cron 均 dispose（无残留 interval）；close 抛错仍在 10s 内退出并有 stderr"},
{"id":"A-04","title":"shuttingDown / quitting 双标志","class":"可参照","official":"apps/desktop/src/main.ts:45","action":"区分『正在关机不要弹框』与『已进入关机不要起新活』两个语义标志","scope_for_us":"退出中触发 fatal→不弹新框仅有 stderr；退出中定时到达→不启动新诊断（日志无新 run id）"},
{"id":"A-05","title":"窗口安全三件套硬基线","class":"可直接复制","official":"apps/desktop/src/main.ts:136","action":"BrowserWindow webPreferences 固定 nodeIntegration:false + contextIsolation:true + sandbox:true，能力只经 preload 白名单","scope_for_us":"渲染进程 typeof require/process 均为 undefined；三开关任一被改则测试报红"},
{"id":"A-06","title":"IPC 频道常量化单一声明点","class":"可直接复制","official":"apps/desktop/src/ipc.ts:6","action":"全部 IPC 频道名收敛到单一 ipc.ts 常量表，主进程与 preload 同源引用，禁止字面量散落","scope_for_us":"频道字面量命中全部位于常量表文件；新增频道必须同时改常量表与类型定义"},
{"id":"A-07","title":"产品 API 面最小化 + protocolVersion","class":"可直接复制","official":"apps/desktop/src/ipc.ts:54","action":"渲染层只拿版本化只读状态与动作入口；版本号/包 URL/安装授权一律不接受渲染层输入","scope_for_us":"渲染层传 version/url 被忽略（非校验后接受）并落拒绝日志；调用不存在的方法抛 not a function"},
{"id":"A-08","title":"来源协议+主机白名单校验","class":"可直接复制","official":"apps/desktop/src/ipc.ts:71","action":"每个 IPC handler 入口先校验 senderFrame 存在 + 协议为应用私有协议 + hostname 命中白名单，失败抛错","scope_for_us":"从 iframe/第三方页发起同频道调用 100% 抛错；assertDesktopSender 调用点数等于 handler 数"},
{"id":"A-09","title":"拥有窗口 + 主帧二次校验","class":"可直接复制","official":"apps/desktop/src/main.ts:228","action":"主窗口级 IPC 叠加『属于哪个 webContents』与『是否 mainFrame』两层校验","scope_for_us":"从子帧发起主窗口级调用抛 rejected IPC from a non-primary frame；窗口销毁后延迟调用抛错不崩溃"},
{"id":"A-10","title":"导航与新窗口全封闭","class":"可直接复制","official":"apps/desktop/src/main.ts:142","action":"setWindowOpenHandler 一律 deny（http/https 交系统浏览器）；will-navigate 仅放行本应用协议与同 origin","scope_for_us":"窗口内跳外站→窗口 URL 不变且系统浏览器被唤起；window.open 返回 null 且无新窗口"},
{"id":"A-11","title":"自定义协议 privileged + codeCache","class":"可参照","official":"apps/desktop/src/main.ts:70","action":"在 app.whenReady 之前 registerSchemesAsPrivileged，并开启 stream 与 codeCache","scope_for_us":"流式响应经私有协议增量到达（首字节<500ms）；注册被挪到 ready 之后会报错"},
{"id":"A-12","title":"preload 按 origin 分级 + stub 降级","class":"可直接复制","official":"apps/desktop/src/preload-app.ts:22","action":"只有产品 origin 挂完整 API；其他 origin 暴露同形态但零能力（仅 protocolVersion）的 stub","scope_for_us":"非产品 origin 下 protocolVersion=1 且 updates=undefined；产品 origin 下两者齐备"},
{"id":"A-13","title":"唤醒/回前台即补检 + 退出反注册","class":"可直接复制","official":"apps/desktop/src/main.ts:571","action":"powerMonitor resume 与窗口 focus 触发补检；will-quit 中 dispose 定时器并 off 监听","scope_for_us":"挂起 2h 唤醒后 30s 内出现一次补检（日志含 resume/focus 原因）；退出后 powerMonitor 监听数归零"},
{"id":"A-14","title":"完成式截止+指数退避+抖动+单调时钟","class":"可直接复制","official":"apps/desktop/src/update-schedule.ts:102","action":"长驻轮询改为完成式排程（计数归零才排下一次）+ 失败 2 倍退避封顶 + ±jitter + performance.now 单调时钟，参数经范围校验","scope_for_us":"注入恒失败上游→间隔按 2 倍增长不超上限且相邻间隔不等；注入固定 now/random→序列可复现（可写成测试）；dispose 后触发抛 polling is disposed"},
{"id":"A-15","title":"停机前准入闸：锁→排空→再检查","class":"可参照","official":"apps/desktop-host/src/update-tasks.ts:40","action":"需要停机的操作前：先拒新请求(503)→await 排空已准入请求→复核锁未被顶替→再检查是否仍有 running/stopping 任务","scope_for_us":"诊断中途发起停机→新请求 503；已准入请求收尾后才返回可停机；期间有新任务准入则返回仍活跃并拒绝停机"},
{"id":"A-16","title":"省电挂起（suspend 落盘 / powerSaveBlocker）","class":"核心自研","official":"（官方无实现）","action":"官方只处理 resume，无 suspend 落盘、无 powerSaveBlocker。Synova 自研：suspend 时落盘 run_state，唤醒后据此续跑；仅用户显式长任务期间 prevent-app-suspension，结束即 stop","scope_for_us":"挂起→唤醒后 run id 不变且无重复副作用；无长任务时 powerSaveBlocker.isStarted() 为 false；长任务结束 5s 内自动 stop"},
{"id":"A-17","title":"首错去重 + 三档恢复 + 可重入","class":"可参照","official":"apps/desktop/src/fatal-recovery.ts:40","action":"致命错误只弹一次；按错误类裁剪选项（端口占用不给『禁用插件』）；恢复动作失败不放弃，改文案后循环重试","scope_for_us":"连抛 5 次致命错误只出现 1 个对话框；端口占用时不出现禁用插件按钮；stop 抛错后弹窗仍可用且第二次点击可成功退出"},
{"id":"A-18","title":"渲染三线统一归口 reportFatal","class":"可直接复制","official":"apps/desktop/src/main.ts:665","action":"did-fail-load（排除 ERR_ABORTED -3）/ preload-error / render-process-gone（排除 clean-exit）统一进同一恢复入口，且退出中与已销毁窗口不报","scope_for_us":"kill 渲染进程→弹恢复框且分类为渲染退出；正常导航→不弹框；退出中 kill→不弹框"},
{"id":"A-19","title":"AggregateError 递归展开","class":"可直接复制","official":"apps/desktop/src/startup-error.ts:11","action":"聚合失败用 AggregateError，展示层递归展开子错误 message，禁止只显示最外层","scope_for_us":"构造启动失败+清理失败→详情同时含两条原因字符串，缺任一即测试失败"},
{"id":"A-20","title":"stderr 有界环形缓冲 64KB","class":"可直接复制","official":"apps/desktop/src/host-process.ts:25","action":"长驻子进程 stderr 用 slice(-64K) 保留尾部，永不无界累积；仅在异常退出时拼入错误","scope_for_us":"灌 10MB stderr→父进程驻留增量<1MB，且保留的是最后一段日志（首段被丢弃）"},
{"id":"A-21","title":"等待用定时器 unref","class":"可直接复制","official":"apps/desktop/src/host-process.ts:49","action":"所有带超时的等待中，定时器建立后立即 unref 并在 finally clearTimeout","scope_for_us":"退出路径上存在 10s 超时等待时，进程不因此延迟退出（退出耗时<1s）"},
{"id":"A-22","title":"分级终止阶梯 + 干净退出判定","class":"可参照","official":"apps/desktop/src/host-process.ts:201","action":"优雅 shutdown(10s)→SIGTERM(5s)→SIGKILL(5s)；并把『已退出』与『干净退出』分成两个结论，不干净则拒绝下一步","scope_for_us":"忽略 SIGTERM 的子进程最终被 SIGKILL 且父进程记录各段耗时；退出码非 0 时判不干净且不继续下一阶段"},
{"id":"A-23","title":"弹窗集合 AbortController 统一撤销","class":"可参照","official":"apps/desktop/src/main.ts:213","action":"并发提示统一登记进集合，状态跃迁时遍历 abort 并清理集合","scope_for_us":"并发打开 3 个提示后进入阻塞态→3 个全关且集合长度归 0（无泄漏）"},
{"id":"A-24","title":"未签名构建限制在 Windows 且硬失败","class":"可直接复制","official":"apps/desktop/scripts/electron-builder-config.mjs:52","action":"把已签名/未签名做成显式开关；不支持未签名的平台直接抛错停构建，禁止静默产出裸包","scope_for_us":"UNSIGNED=1 打 macOS→构建非 0 退出并打印该错误；不带开关打 macOS→产物通过 codesign --verify"},
{"id":"A-25","title":"mac hardenedRuntime + notarize + signIgnore","class":"可参照","official":"apps/desktop/scripts/electron-builder-config.mjs:126","action":"一次性定好预签名子树与封签责任（signIgnore 覆盖已预签名运行时与 pak），并开 hardenedRuntime + notarize","scope_for_us":"codesign --verify --deep --strict 通过 + spctl -a -t exec 通过 + 首次启动无 Gatekeeper 拦截"},
{"id":"A-26","title":"签名后独立验签（fail-closed）","class":"可直接复制","official":"apps/desktop/scripts/electron-builder-config.mjs:166","action":"签名后加独立验签步骤，并同时校验包内更新配置一致性；任一失败即中断构建","scope_for_us":"人为破坏签名或改坏 app-update.yml→构建失败并指出是哪一项校验失败"},
{"id":"A-27","title":"win forceCodeSigning + sha256","class":"可直接复制","official":"apps/desktop/scripts/electron-builder-config.mjs:178","action":"Windows 包强制签名 + sha256 摘要，且签名发布者名与更新包发布者同源取值","scope_for_us":"Get-AuthenticodeSignature 为 Valid 且 Subject 与更新配置发布者一致"},
{"id":"A-28","title":"运行时树 sha256 完整性清单","class":"可参照","official":"apps/desktop/src/runtime-tree.ts:77","action":"随包运行时生成条目级 sha256+可执行位清单并写入根描述符，启动/升级时可校验","scope_for_us":"篡改运行时任一文件→校验报红并指名路径；清单缺失→降级且显式 degraded（不静默继续）"},
{"id":"A-29","title":"下载/安装分离，双授权","class":"可直接复制","official":"apps/desktop/src/update-coordinator.ts:65","action":"autoDownload=false + autoInstallOnAppQuit=false；下载与安装是两个独立 API，各需一次用户确认","scope_for_us":"仅检查自动；不点下载则无更新流量（抓包 0 字节）；点下载后关闭应用→版本号不变"},
{"id":"A-30","title":"allowDowngrade=false","class":"可直接复制","official":"apps/desktop/src/update-coordinator.ts:70","action":"显式关闭降级，并用 gt(version,current) 自行判定是否更新，不依赖上游语义","scope_for_us":"feed 指向更低版本→状态停在 idle，不出现可下载项（可写成单测）"},
{"id":"A-31","title":"安装授权版本绑定（拒绝 TOCTOU）","class":"可直接复制","official":"apps/desktop/src/update-coordinator.ts:127","action":"主进程持有候选项，渲染层只回显确认；install/download 均校验 version===candidate，错位即拒","scope_for_us":"下载 0.15.8 后把确认版本改成 0.15.9→抛 confirmed target is not ready 且不安装"},
{"id":"A-32","title":"更新前活动任务闸九步编排","class":"可参照","official":"apps/desktop/src/main.ts:348","action":"等落定→inspect 读态→用户确认→lock→复核活跃态未变→干净停后端→接管退出；异常→unlock 恢复准入；失败→自动重启后端并重新导航","scope_for_us":"诊断运行中发起升级→提示有活跃任务且需二次确认；锁期间新请求 503；停后端失败→版本不变、后端自动拉起、界面可用（无白屏死锁）"},
{"id":"A-33","title":"空闲超时 + 参数校验 + 主动 abort","class":"可直接复制","official":"apps/desktop/src/update-http-executor.ts:13","action":"对外 HTTP 用空闲（静默）超时而非总时长超时；超时值范围校验；超时后解绑全部监听并 abort 请求","scope_for_us":"慢速但持续有字节的大文件不被中断；建立后静默→在阈值内中断且错误码 ETIMEDOUT；传 0 或 1e12→启动即抛参数错误"},
{"id":"A-34","title":"网络 vs 操作失败分离分类","class":"可直接复制","official":"apps/desktop/src/update-presentation.ts:5","action":"按操作(check/download/install)×是否网络错误组合成语义枚举，映射到不同恢复建议；渲染层只拿语义不拿原始诊断","scope_for_us":"断网触发检查失败→走 *-network 分支且文案不含原始堆栈；非网络错误→走非 network 分支，两条路径可分别断言"},
{"id":"A-35","title":"离线内建壳 + 后端未就绪 503 占位","class":"可参照","official":"apps/desktop/src/main.ts:406","action":"壳资源由主进程从随包 dist 本地服务；权威数据走后端；后端未就绪返回 503 占位（含重试入口）而非白屏","scope_for_us":"拔网线启动→壳正常渲染且无网络请求；后端未起时出现 503 占位与重试按钮；请求 /../../etc/passwd→403"},
{"id":"A-36","title":"模态覆盖窗跟随父窗/即解绑/ready-to-show","class":"可参照","official":"apps/desktop/src/update-overlay.ts:13","action":"模态用跟随父窗内容边界的覆盖层；closed 时同时解绑 move/resize 并移除注入 CSS；ready-to-show 才 show；Windows 回退原生模态","scope_for_us":"拖拽/缩放父窗覆盖层 1 帧内跟随无错位；连续开关 20 次父窗监听数不增长且 CSS 注入归零；无白闪"},
{"id":"A-37","title":"子窗口 IPC 三重归属校验","class":"可直接复制","official":"apps/desktop/src/update-dialog.ts:107","action":"子窗口 IPC 校验 sender + 必须 mainFrame + URL 全等于专属页面；响应值只接受已展示过的选项索引或 cancelId","scope_for_us":"从主窗口调子窗口频道→抛错；子窗口传未展示索引(如 99)→抛 invalid dialog response"},
{"id":"A-38","title":"托盘（Tray）官方无实现 → 我方自研","class":"核心自研","official":"（官方无实现）","action":"自研：Tray+模板图(菜单=打开主窗/暂停哨兵/检查更新/退出)；关窗=隐到托盘、退出=走完整 before-quit 清理；无托盘环境降级为普通窗口并显式 degraded","scope_for_us":"关窗后进程仍在且哨兵继续跑；托盘暂停哨兵后 5s 内无新哨兵运行；托盘退出后 ps 无残留；无托盘环境有明确日志与 degraded 标记"},
{"id":"A-39","title":"长驻事件日志 JSONL + 白名单字段落盘","class":"可参照","official":"apps/desktop/src/update-journal.ts:20","action":"长驻/更新过程写白名单字段的 JSONL（只 phase/targetVersion/整数进度/固定错误分类），每条 flush，禁止原始错误文本与凭证落盘","scope_for_us":"日志中不出现任何原始错误串/URL/凭证（正则扫描可判）；每条记录落盘后进程被杀仍可读；同一状态重复上报不写重复行"}
]}
```

### 聚合口径与**机械计数**（给 task-5）

下列数字**不是人工点数**，是把上方 JSON 块喂给解析器后的原始输出：

```console
$ python3 - <<'PY'
import json,re,collections
s=open('docs/synova/research/official-electron-kernel-runtime.md',encoding='utf-8').read()
items=json.loads(re.findall(r'```json\n(.*?)\n```', s, re.S)[-1])['d870_borrow_items']
print("items:", len(items))
print("class counts:", dict(collections.Counter(i['class'] for i in items)))
print("unique ids:", len({i['id'] for i in items}))
print("no-impl:", [i['id'] for i in items if '官方无实现' in i['official']])
PY
items: 39
class counts: {'可直接复制': 24, '可参照': 13, '核心自研': 2}
unique ids: 39
no-impl: ['A-16', 'A-38']
```

**结论（供总表照抄，勿再人工重数）**：

| 项 | 值 | 明细 |
|---|---|---|
| JSON 块条目总数 | **39** | A-01 … A-39，连续编号、无缺号、无重号（unique ids = 39） |
| `official` 为「（官方无实现）」的条目 | **2** | A-16（省电挂起）、A-38（托盘） |
| **归入"官方无实现"分组、不混入三分类计数** | **2 条** | 同上；两条 `class` 均标 `核心自研`（表示**我方需自研**），但**不因此计入三分类** |
| **计入三分类的条目** | **37 条** | 39 − 2 = 37 |
| ├ `可直接复制` | **24 条** | A-01, A-02, A-05, A-06, A-07, A-08, A-09, A-10, A-12, A-13, A-14, A-18, A-19, A-20, A-21, A-24, A-26, A-27, A-29, A-30, A-31, A-33, A-34, A-37 |
| ├ `可参照` | **13 条** | A-03, A-04, A-11, A-15, A-17, A-22, A-23, A-25, A-28, A-32, A-35, A-36, A-39 |
| └ `核心自研`（有官方实现者） | **0 条** | 本切片标 `核心自研` 的 2 条全部属于"官方无实现"，故三分类内 `核心自研` 为 0 |

> **给 task-5 的特别提示**：本切片 `class` 字段里 `核心自研` **只出现在 A-16/A-38**，而这两条的 `official` 同时是「（官方无实现）」。按总表口径它们必须进"官方无实现"分组，所以**三分类表里 `核心自研` 一栏在本切片贡献为 0**——这不是漏标，是这两条本就无官方对应物。若总表需要非空 `核心自研`，应从 B/C/D 切片取，或把 A 的 `可参照` 项升格，**不得**把 A-16/A-38 从"官方无实现"组挪回三分类。

**配额对账**：本切片配额 ≥12，实际计入三分类 **37 条**（另 2 条官方无实现单列）→ **配额满足（37 ≥ 12）**。

### 证据索引

- 全部官方 file:line 的逐行复现输出：§十二（100% 覆盖，非抽样）
- 引用点（非字符串存在）检查：§十二末
- 红线自检（G1 = 0；工作树 status）：§十二末
- 未覆盖 / 存疑项：§十三
