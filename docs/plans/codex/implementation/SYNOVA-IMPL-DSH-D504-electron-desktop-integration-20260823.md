---
north-star:
  服务用户: FDE（前线部署工程师，无运维背景、在客户现场）——痛点：现在必须开终端跑 `npm run dev` 起服务器再手动开浏览器，客户现场不可行，产品不可达
  服务场景: FDE 拿到 SynovaAgent 安装包 → 双击安装 → 桌面快捷方式 → 打开即用（服务自启，不碰命令行）→ 30 分钟内发起首诊对话
  模块终态: Electron 桌面端一体化——安装包可打（mac dmg + win nsis）、服务自启开窗即用、双引导收敛单一入口、桌面对话 UI 接上首诊链路；L1 线 1（桌面端）验收点 1-1/1-4/1-5/1-7 转绿，GS-01 场景成为桌面端证据引擎
  对齐北星: PRODUCT-BRIEF.md §六 P0「没有这些不能给 FDE 用」+ §一「驻扎企业内部」——产品不可达的第一物理障碍是入口（双击安装 → 服务自启 → 开窗即用 → 30 分钟首诊）；对应 product-lines.yaml 线 1（桌面端，baseline 40%，自启/双平台实测 = 0）
  完成标准: GS-01 场景转绿（exit 0 + 证据入库）+ L1 验证点 ≥4 项 verified（1-1 打包产物 / 1-4 服务自启 / 1-5 单一入口 / 1-7 升级不丢数据基础，机器判定）
  当前进度: electron/main.cjs 153 行雏形（BrowserWindow/Tray/Notification/离线页，D111+D233）；electron/package.json 79 字节（仅 main/type/electron devDep，无打包配置）；build-synova.cjs 72 行已有 win/mac/linux target 但从未实测（D255 只规划未验证）；electron-renderer/ 36 文件（React 对话 UI + useStreaming 已调 POST /api/diagnosis/consult）但从未被 main.cjs 加载；无服务自启、无打包实测、renderer vite proxy 指向 3000 与服务器 18790 不一致
---

<!--
  SYNOVA-IMPL-DSH-D504: Electron 桌面端一体化（GS-01 前置，L1 桌面端 0/8 → 可装可跑）
  状态: dev doc | 2026-08-23 | 优先级 P0（26 线 L1 桌面端 0/8，产品不可达）
  权威文档: 派单-devdoc-20260823-D504-D505.md（CTO 决策）+ product-lines.yaml 线 1 + TASK-ROUTING.md §一 + AGENTS.md 铁律 0-2/4/7/24/31/32/39/47/48
  依赖: 无（不依赖 Win；src/ 只读——服务端归 Win）
  并行: 与 D505 无写集重叠（electron/* + electron-renderer/* + build-synova.cjs + GS-01 场景 = Mac DSH 领地；D505 在 src/sentinel/ + src/cron/ + src/agent/sentinel-service，零交集）
-->

# SYNOVA-IMPL-DSH-D504: Electron 桌面端一体化

> 一句话问题: 产品对 FDE 的**物理入口不存在**——桌面端只有 153 行瘦客户端雏形（[main.cjs](electron/main.cjs:1)），无服务自启、无打包实测、双引导未收敛，renderer 对话 UI 写好了但从未被加载；26 线 L1 桌面端 0/8，`done_definition`（"创始人双击安装包 → 装好 → 服务自启 → 开窗即用"）一项都不满足。

## 1. Authority Doc Verification

**来源**: [派单-devdoc-20260823-D504-D505.md](docs/synova/coordination/派单-devdoc-20260823-D504-D505.md)（Spec 1，CTO 已做决策，dev-doc 复核）

> 落地对象: `electron/main.cjs`（153 行）+ `electron/preload.cjs` + `electron/package.json`（无 electron-builder 配置）+ `electron-renderer/`（36 文件雏形）。现状: main.cjs 有 BrowserWindow/Tray/Menu/Notification，SERVER_URL 硬编码 localhost:18790；**无 spawn 后端服务、无开机自启、无打包配置**。验收: GS-01 场景转绿（exit 0 + 证据入库）+ L1 验证点 ≥4 项 verified。⚠️ 归属: electron/ + electron-renderer/ 归 Mac DSH ✅；**服务端 src/server 归 Win——服务自启方案不得改 src/**。

> dev-doc 必须回答: ①服务自启方案（Electron spawn vs 系统服务 vs 打包内嵌，给契约）②打包方案（electron-builder，双平台产物路径）③安装引导收敛（双引导 → 单一入口）④首诊旅程接线（renderer 调 consult 路径，30 分钟承诺假设条件）⑤与 GS-01 的接口（CI 无 GUI 如何验证）。

**来源**: [product-lines.yaml 线 1](docs/synova/product-lines/product-lines.yaml)（L1 桌面端验收点，L32-80）

> 1-1 安装包能打出来（Electron 打包流程产出可安装产物）→ evidence: scenario:GS-01；1-4 服务自启、开窗即用（用户不用碰命令行）→ evidence: scenario:GS-01；1-5 安装引导单一入口（双引导收敛）→ evidence: scenario:GS-01；1-7 升级/重装不丢数据（企业数据安全底线）→ evidence: scenario:GS-07。

**来源**: [TASK-ROUTING.md](docs/synova/coordination/TASK-ROUTING.md)（§一 模块所有权表）

> electron/ + electron-renderer/ → **Mac DSH**（Electron 一体化）。src/（除 sentinel/cron/mcp 外）→ Win Claude Code。服务自启方案不得改 src/——用 spawn `npm run dev` / 独立进程管理 / launchd 注册，避开 Win 写集。

**来源**: [AGENTS.md](AGENTS.md)（铁律 0-2/4/7/24/31/32/39/47/48）

> 铁律 0-2: spec → test → impl → wire，Step 5 WIRE CHECK 硬门禁（grep 新函数名 src/）。铁律 4: 入口 → 交互 → 结果三环节缺一不可交付。铁律 31: 降级信号传播——后端 spawn 失败必须 degraded 显式（离线页已有）。铁律 39: L1 交互层只与 L2 通信——Electron（L1）经 HTTP 调 API，不直连 L4/L5。

## 2. Problem Statement

Synova 是"驻扎企业内部的 AI 诊断 Agent"，FDE 是直接用户。但当前 FDE 使用产品需要：开终端 → `npm run dev` 起服务器 → 手动开浏览器 → 访问 localhost:18790。客户现场没有这套开发环境，**产品对目标用户不可达**（26 线 L1 桌面端 0/8）。

三段断裂（实测）：
1. **无服务自启**：[main.cjs](electron/main.cjs:23) 只检测 `SERVER_URL` 可达性（L30-38 `checkServer`），不可达就显示离线页（L43-69）——**从不尝试拉起后端**。用户装完打开 = 看到"Server 未启动"红卡。
2. **无打包实测**：[build-synova.cjs](build-synova.cjs:1) 有 win nsis / mac dmg / linux AppImage 配置，但从未产出过可安装产物（D255 只规划未验证；`dist/` 为空，renderer `dist/renderer` 不存在）。
3. **renderer 未接线**：[main.cjs](electron/main.cjs:94) 加载的是服务器端 `app/login.html`，而 [electron-renderer](electron-renderer/src/App.tsx:1) 的 React 对话 UI（含 [useStreaming](electron-renderer/src/hooks/useStreaming.ts:179) 已调 `POST /api/diagnosis/consult` SSE 首诊链路）**从未被加载**——写好的首诊入口躺在仓库里。

## 3. Q0-Q4

### 3.1 Q0 定位 — 项目拼图 + 文件审计

**a) 项目拼图**: Synova 五层架构 L1 交互层。桌面端 = L1 的桌面载体（另有 routes API / TUI / MCP）。本任务把桌面端从"浏览器壳雏形"推进到"可装可跑一体化"——补 26 线 L1 桌面端 8 个验收点中机器可判定的 4 个（1-1/1-4/1-5/1-7）。

**b) 文件审计**（grep 实测，2026-08-23）:
| 文件 | 现状 | 复用/扩展/新建 |
|------|------|------|
| electron/main.cjs | 153 行，BrowserWindow/Tray/Notification/checkServer/离线页 | 扩展（集成 backend-spawn） |
| electron/preload.cjs | 13 行，contextBridge 暴露 getServerUrl/getConfig | 扩展（如需暴露 spawn 状态） |
| electron/package.json | 79 字节，仅 main/type/electron devDep | 扩展（build 字段/脚本） |
| build-synova.cjs | 72 行，win/mac/linux target 齐全 | 扩展（extraResources 带后端 dist + 数据目录） |
| electron-renderer/ | 36 文件，App/CenterPanel/useStreaming 已调 consult | 接线（fetch base URL + proxy 端口） |
| scripts/golden-scenarios/GS-01-first-diagnosis/ | 契约级断言 3 条（D446 已交付） | 扩展（Electron 产物断言组） |
| src/config.ts | L90 `process.env.SYNOVA_DB_PATH` 支持数据目录重定向 | 只读复用（不修改——Win 领地） |
| src/routes/healthz.ts | L323 `GET /api/healthz`（200=healthy/degraded, 503=down） | 只读复用（spawn 探活目标） |

**c) 决策**: 无冲突——electron/ + electron-renderer/ 归 Mac DSH，src/ 只读（服务端归 Win，红线遵守）。

### 3.2 Q1 调研 — 业界最佳实践 / Anthropic 决策链 / memory 教训

**业界最佳实践**:
- **Electron 官方进程管理**: Electron ≥22 提供 [`utilityProcess.fork`](https://www.electronjs.org/docs/latest/api/utility-process)（官方文档）——用 Electron 自带的 Node.js 运行时跑子进程脚本，**无需客户机装系统 Node**，比 `child_process.spawn('node', ...)` 更贴合"打包后自包含"（electron@33 已支持，electron/package.json devDep `^33.4.11` 实测）。
- **electron-builder 打包**: 业界标准（electron-builder 官方 Quick Start）——`files` 白名单 + `extraResources` 带运行资产 + nsis（win）/dmg（mac）target；`--dir` 产出 unpacked 目录可做 CI 无 GUI 验证（electron-builder CLI 文档：`electron-builder --dir` 跳过安装包阶段）。
- **Anthropic 基线**: 垂直切片交付（入口→交互→结果三环节可验证）；先做用户可见的；进程管理契约 = 生命周期/端口冲突/日志三件套。

**memory/ 教训**（[memory/notes](memory/notes/README.md)）:
- D255（Electron 打包规划）: "打包流程存在但从未作为场景断言实测"——**声称打包 = 必须有产物证据**（product-lines.yaml L45 note 原文）。
- D233（Electron 可启动性修复）: 主进程降级必须 try/catch 显式（main.cjs L82-89 icon try/catch 模式），延续此模式。
- D462（sqlite v12/node24）: 环境差异是坑——打包后后端运行时 = Electron 内置 node（v20+），与开发机 node24 有差异，spec 必须给"构建产物 = tsc dist"（非 tsx 运行时）。

**收敛**: 服务自启 = Electron 进程内 spawn（utilityProcess.fork 或 child_process），不走系统服务注册（launchd/Windows 服务需要安装器权限 + 卸载清理，CI 不可测，违背最小机制）；不内嵌独立 node 二进制（体积爆炸）。**参考：Anthropic（垂直切片）+ DeepSeek（最少机制）+ 第一性原理（Electron 本身就是进程宿主）**。

### 3.3 Q2 范围 — 正确的最简方案

**做什么**（对应写集 §5.1）:
1. 服务自启: 新建 `electron/backend-spawn.cjs`（纯 Node 可无头测试）→ main.cjs 集成
2. 打包: build-synova.cjs 补 extraResources + electron/package.json 补字段 + 产物验证
3. 双引导收敛: main.cjs `app.isPackaged` 分支 + README/install 引导
4. renderer 接线: fetch base URL + vite proxy 端口修正 + main.cjs 生产态加载 renderer 产物
5. GS-01 增强: Electron 产物断言组
6. 测试: tests/electron/backend-spawn.test.ts + tests/electron/desktop-build.test.ts

**不做什么**（详见 §6）: 不改 src/ 任何文件（Win 领地）；不做 auto-update/代码签名；不做 Linux 打包实测（CI 只 --dir）；不重构 renderer UI。

### 3.4 Q3 验收 — 入口 → 交互 → 结果

- **入口**: `bash scripts/golden-scenarios/GS-01-first-diagnosis/run.sh`（增强版）——机器判定 exit 0
- **交互**: 场景断言 → electron-builder --dir 产物存在 + backend-spawn 契约单测 + renderer 构建产物存在 + main.cjs 生产分支静态断言
- **结果**: GS-01 转绿（exit 0 + evidence/GS-01-<date>.json 入库）+ L1 验证点 ≥4 verified（1-1 打包产物 / 1-4 服务自启 / 1-5 单一入口 / 1-7 数据目录 userData 重定向）→ product-progress 线 1 更新
- 本地（Mac）手动验证: `npm run electron:build:mac` 产出 dmg → 安装 → 双击 → 自启 → 开窗

### 3.5 Q4 契约与测试（铁律 47/48 — 写代码前定义）

**backend-spawn.cjs 契约**:
```
@input  options: { serverUrl: string; cwd: string; mode: 'dev' | 'prod'; dbPath?: string; logFile?: string; maxRestarts?: number }
@output ensureBackend(): { started: boolean; pid?: number; reused?: boolean; degraded?: boolean; error?: string }
   - started=true  → 探活失败 → spawn 后端 → 探活成功（≤60s 轮询）
   - reused=true   → 探活成功（已有服务在跑，不重复 spawn——端口冲突安全网）
   - degraded=true → spawn 后探活仍失败 / 重启超限（maxRestarts=3/10min）→ 显式标记（离线页可显示）
@degraded — 任何 spawn/探活异常 → log.error + degraded 标记（铁律 24/31，不静默）
@error    — 无（内部全捕获，返回对象；不抛）
@lifecycle — stop(): SIGTERM 回收；app.before-quit 挂钩；进程退出孤儿保护（child.unref 或 kill）
```

**测试三路径（red→green 见 §7）**: 正常（探活失败 → spawn → 探活成功）/ 降级（spawn 后仍不可达 → degraded + 重启限次）/ 边界（已有服务 → reused 不 spawn；maxRestarts 超限）。

## 4. Current State — 代码审计（2026-08-23 grep/read 实测）

### 4.1 缺陷 A（P0）: 无服务自启——server 不可达只显示离线页，从不拉起

[main.cjs L23-38](electron/main.cjs:23) — `SERVER_URL = config.serverUrl || 'http://localhost:18790'`；`checkServer()` 只 GET /api/healthz 判可达性；[L92-97](electron/main.cjs:92) `createWindow()` 中 `online ? loadURL(login.html) : loadURL(离线页)`——**失败路径没有"尝试启动后端"动作**，用户装完必见红卡。

### 4.2 缺陷 B（P0）: 打包从未实测——产物、配置有效性均为零证据

- [build-synova.cjs](build-synova.cjs:1) 配置存在（win nsis / mac dmg / linux AppImage / files 白名单），但 D255 只规划未验证（[product-lines.yaml L45](docs/synova/product-lines/product-lines.yaml:45) note: "打包流程存在（D255），但未作为场景断言实测"）。
- 实测: `dist/` 不存在（`npm run build` 未跑过）、`dist/renderer` 不存在（renderer build 未跑过）、`release/` 为空。
- [electron/package.json](electron/package.json:1)（79 字节）无任何 electron-builder 配置/脚本——打包配置全在根目录 build-synova.cjs，两处割裂。

### 4.3 缺陷 C（P1）: renderer 对话 UI 从未被 main.cjs 加载——首诊入口未接线

[main.cjs L94](electron/main.cjs:94) `mainWindow.loadURL(\`${SERVER_URL}/app/login.html\`)`——加载服务器端登录页；而 [electron-renderer/src/App.tsx](electron-renderer/src/App.tsx:1) 的 React 对话 UI（CenterPanel + [useStreaming.ts L179](electron-renderer/src/hooks/useStreaming.ts:179) 已实现 `POST /api/diagnosis/consult` SSE 首诊链路 + WelcomeScreen 首诊入口）**零接线**。renderer 是"躺在仓库的成品"。

### 4.4 缺陷 D（P2）: vite proxy 端口残留不一致

[vite.config.ts L18](electron-renderer/vite.config.ts:18) proxy target `http://localhost:3000`，服务器实际端口 [src/config-file.ts L51](src/config-file.ts:51) `port: 18790`——dev 态 renderer 代理 /api 会 502。

### 4.5 接线现状（真实调用方，grep 实测）

| 符号 | 位置 | 说明 |
|------|------|------|
| main.cjs `checkServer` | electron/main.cjs:30-38 | 仅内部使用（createWindow L92）——无生产调用方问题，但功能单一 |
| `app/login.html` | app/login.html:1 | main.cjs 唯一加载目标（L94） |
| renderer `useStreaming.sendMessage` | electron-renderer/src/hooks/useStreaming.ts:179 | fetch `/api/diagnosis/consult` 相对路径——生产 loadFile 后相对路径失效（需 base URL） |
| `GET /api/healthz` | src/routes/healthz.ts:323 | spawn 探活目标（200=healthy/degraded；503=down）——只读复用 |
| `SYNOVA_DB_PATH` | src/config.ts:90 | 数据目录重定向环境变量——spawn 时注入（userData），零 src/ 改动 |
| `npm run build` | package.json `build = tsc` | 后端 dist 产物（`node dist/index.js` 为生产入口，package.json main） |

## 5. What We Build

### 5.1 写集 (5 修改 + 4 新建)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| [electron/backend-spawn.cjs](electron/backend-spawn.cjs) | 新建 | 服务自启核心：探活 → spawn 后端 → 重启限次 → 退出回收。纯 Node（不 require electron，可无头测试）。契约见 §3.5 |
| [electron/main.cjs](electron/main.cjs) | 修改 | 集成 backend-spawn：`app.whenReady` 时 `ensureBackend()`（dev 态 spawn `npx tsx src/index.ts`；prod 态 spawn `node dist/index.js` + `SYNOVA_DB_PATH=<userData>/data`）；`app.isPackaged` 分支加载 renderer 产物 vs 服务器页面；`before-quit` 调 `stop()` |
| [build-synova.cjs](build-synova.cjs) | 修改 | `extraResources` 带后端运行资产（dist/ + extensions/ + 必要配置）；确认 `files` 含 electron/backend-spawn.cjs；产物路径 `release/` 文档化 |
| [electron/package.json](electron/package.json) | 修改 | 补 `build` 字段（指向根 build-synova.cjs 或自带配置）+ 打包脚本（`pack`/`pack:dir`） |
| [electron-renderer/vite.config.ts](electron-renderer/vite.config.ts) | 修改 | proxy target 3000 → 18790（缺陷 D） |
| [electron-renderer/src/hooks/useStreaming.ts](electron-renderer/src/hooks/useStreaming.ts) | 修改 | fetch 加 base URL（`window.electronAPI?.getServerUrl()` 前缀，fallback `/`）——生产 loadFile 后相对路径失效 |
| [electron-renderer/src/App.tsx](electron-renderer/src/App.tsx) | 修改 | L49 `fetch('/health')` 同款 base URL 处理 |
| [scripts/golden-scenarios/GS-01-first-diagnosis/run.sh](scripts/golden-scenarios/GS-01-first-diagnosis/run.sh) | 修改 | 加断言组：①Electron 打包产物（--dir unpacked）存在 ②backend-spawn 契约（node 无头调 ensureBackend 探活逻辑）③renderer 构建产物 dist/renderer 存在 ④SYNOVA_DB_PATH 重定向断言（config.ts:90 只读验证） |
| [tests/electron/backend-spawn.test.ts](tests/electron/backend-spawn.test.ts) | 新建 | spawn 契约三路径测试（正常/降级/边界，≥8 用例，见 §7） |
| [docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D504-electron-desktop-integration-20260823.md](docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D504-electron-desktop-integration-20260823.md) | 新建 | 本 dev doc |

> 版本信号（runtime）：git tag/commit message 含 D504 标识；不新增 VERSION.md 版本（非控制塔变更）。

### 5.2 修复模式（编码 session 实现蓝图）

**backend-spawn.cjs（服务自启，缺陷 A）**:

```js
// 纯 Node 模块，不 require('electron') — 可无头测试
// 契约: ensureBackend(options) → { started, pid?, reused?, degraded?, error? }
const { spawn } = require('child_process');
const http = require('http');

function probe(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const req = http.get(`${url}/api/healthz`, { timeout: timeoutMs }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function ensureBackend(options) {
  const { serverUrl, cwd, mode, dbPath, logFile } = options;
  const maxRestarts = options.maxRestarts ?? 3;
  // 1. 探活 — 已有健康服务 → reused（端口冲突安全网，不重复 spawn）
  if (await probe(serverUrl)) return { started: false, reused: true };
  // 2. spawn 后端（dev: npx tsx src/index.ts；prod: node dist/index.js + SYNOVA_DB_PATH）
  const cmd = mode === 'prod'
    ? { bin: 'node', args: ['dist/index.js'], env: { ...process.env, SYNOVA_DB_PATH: dbPath } }
    : { bin: 'npx', args: ['tsx', 'src/index.ts'], env: { ...process.env } };
  const child = spawn(cmd.bin, cmd.args, { cwd, env: cmd.env, stdio: ['ignore', 'pipe', 'pipe'] });
  // 日志 → logFile（app.getPath('userData')/logs/backend.log），stdout/stderr 管道
  // 3. 探活轮询（≤60s）→ 成功返回 started:true；失败 → 重启（≤maxRestarts/10min）
  // 4. 超限 → { degraded: true, error }（main.cjs 显示离线页 + degraded 提示，铁律 24/31）
  // stop(): SIGTERM → child.kill('SIGTERM')；app.before-quit 挂钩；孤儿保护
  // 返回句柄 { child, pid, stop } 供 main.cjs 持有
}
```

**main.cjs 集成（缺陷 A + C）**:

```js
// app.whenReady: 先 ensureBackend 再 createWindow
const { ensureBackend } = require('./backend-spawn.cjs');
const isProd = app.isPackaged;
const backend = await ensureBackend({
  serverUrl: SERVER_URL,
  cwd: isProd ? process.resourcesPath : process.cwd(),   // prod: resources 含 dist+extensions
  mode: isProd ? 'prod' : 'dev',
  dbPath: isProd ? path.join(app.getPath('userData'), 'data', 'synova.db') : undefined,
  logFile: isProd ? path.join(app.getPath('userData'), 'logs', 'backend.log') : undefined,
});
if (backend.degraded) console.warn('[electron] 后端自启降级 — 显示离线页（铁律 24/31 不静默）');

// 生产态加载 renderer 产物（缺陷 C 接线）:
if (isProd) {
  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'));
} else {
  mainWindow.loadURL(isDevServerReachable ? 'http://localhost:5173' : `${SERVER_URL}/app/login.html`);
}
// before-quit: backend?.stop()
```

**数据目录（缺陷 B 的一部分 + L1-7 基础）**: spawn prod 时注入 `SYNOVA_DB_PATH=<userData>/data/synova.db`（[src/config.ts L90](src/config.ts:90) 已支持）——数据在 userData，升级/重装安装包不丢数据（L1-7），且**零 src/ 改动**（Win 领地红线）。

### 5.3 决策参考（S-12，本任务决策点）

| 决策点 | 选项 | 参考系 | 结论 |
|--------|------|--------|------|
| 服务自启方案 | A Electron 进程内 spawn / B 系统服务注册（launchd/Windows 服务）/ C 打包内嵌独立 node 二进制 | Anthropic（垂直切片：开窗即用是第一环）+ DeepSeek（最少机制）+ 第一性原理（Electron 即进程宿主） | **A**——B 需安装器权限+卸载清理（CI 不可测）；C 体积爆炸。A 的 prod 形态用 `child_process.spawn('node', ['dist/index.js'])`（Electron 内置 node 或系统 node），dev 形态 `npx tsx src/index.ts`；utilityProcess.fork 作为编码 session 可选增强（Electron 33 支持），默认 spawn 保持简单 |
| 打包验证深度 | A CI 全量 dmg/exe / B CI 只 `--dir` unpacked + 本地实测安装包 | 派单已知风险（"electron-builder 下载二进制慢，CI 可能超时——spec 里给降级"） | **B**——CI（ubuntu）跑 `electron-builder --dir`（linux unpacked，验证配置+产物存在）；mac dmg / win nsis 本地（Mac）实测 + 证据 JSON 入库（L1-1/1-2/1-3 证据链） |
| renderer 接线方式 | A 生产态 loadFile renderer 产物 + base URL / B 继续加载服务器 login.html | 第一性原理（renderer 对话 UI 已写好，接上是首诊旅程最短路径）+ Anthropic（结果可见） | **A**——useStreaming 已调 consult（SSE 首诊链路），只需 base URL；login.html 是登录页非对话入口，产品终态对话 UI 在 renderer |
| 数据目录 | A SYNOVA_DB_PATH 重定向 userData / B 后端改 config | 红线（src/ 归 Win 只读）+ 最小机制 | **A**——环境变量注入，零 src/ 改动，且天然满足 L1-7（升级不丢数据） |

> 收敛检查：四决策点两参考系指向一致，无分歧。**参考：Anthropic + DeepSeek + 第一性原理（D333 决策模式）**。

### 5.4 编码 session 实现时需再确认的项（dev-doc 未知留接口）

1. **prod 态后端运行时**: `spawn('node', ['dist/index.js'])` 依赖客户机系统 Node（≥20）；若要求完全自包含 → 换 `utilityProcess.fork(backendBundle)`（需 esbuild bundle 后端为单文件，额外写集）。编码 session 按"先 spawn（最少机制），utilityProcess 作增强"执行，若验收时发现 spawn 环境不可行再升级。
2. **renderer base URL 封装点**: useStreaming L179 + App.tsx L49 两处 fetch——编码 session 决定抽 `src/lib/api.ts` 统一封装还是逐处改（建议统一封装，最小 2 处调用）。
3. **GS-01 断言组 ④（SYNOVA_DB_PATH 重定向）**: 断言方式（读 src/config.ts:90 静态断言 vs 子进程实测）由编码 session 定——建议静态 grep 断言（无副作用）。

## 6. What We Don't Do

| 不做 | 原因 |
|------|------|
| 不改 src/ 任何文件（src/server、src/config.ts、src/routes/ 全部只读） | ⚠️ 红线：服务端归 Win（TASK-ROUTING §一）；服务自启用 spawn + 环境变量注入，零 src/ 改动 |
| 不做 auto-update / 代码签名（build-synova.cjs L67-71 publish 保持注释） | 超出本任务（产品早期，D255 同款 Q2 排除） |
| 不做 Linux 安装包实测 | CI 只 `--dir` unpacked 验证配置（已知风险降级方案） |
| 不重构 renderer UI / 不新增页面 | renderer 36 文件已完整，只接线（base URL + 端口） |
| 不跑真实 LLM 首诊全链路 | GS-01 契约级断言（D446 诚实 RED 声明：consult 六阶段依赖 LLM，非确定性不进机器断言）——保持一致 |
| 不改 scripts/watchdog.js / 不注册 launchd | 服务自启 = Electron 进程内 spawn（§5.3 决策）；watchdog 是服务器进程级，另属 L22 |
| 不动 tests/sentinel/、src/sentinel/、src/cron/ | D505 领地（哨兵自诊断），D504 与 D505 写集零交集 |

## 7. Test Requirements

### 7.1 L1 单元契约（tests/electron/backend-spawn.test.ts，新建）

red→green 对照表（铁律 0-2：测试先行，修复前必须失败）：

| 用例 | 修复前（red） | 修复后（green） |
|------|------|------|
| 探活失败 → ensureBackend spawn 后端 → 探活成功 → `{ started: true }` | 无此模块（文件不存在 → 编译失败） | spawn 契约成立 |
| 探活成功（已有服务）→ `{ reused: true }` 不 spawn | 同上 | 端口冲突安全网 |
| spawn 后探活仍失败 → 重启（≤3 次/10min） | 同上 | 重启限次逻辑 |
| 重启超限 → `{ degraded: true, error }`（显式，铁律 24/31） | 同上 | 不静默降级 |
| `stop()` → SIGTERM 回收子进程（无孤儿） | 同上 | 生命周期闭环 |
| prod 模式 env 注入 `SYNOVA_DB_PATH`（断言 spawn env） | 同上 | 数据目录重定向 |
| dev 模式命令 = `npx tsx src/index.ts`（断言 args） | 同上 | 双模式契约 |
| 后端不存在（spawn ENOENT）→ `{ degraded: true }` 不抛 | 同上 | 异常捕获 |

> 注：backend-spawn.cjs 纯 Node 无 electron 依赖 → vitest（node 环境）可直测，这是"CI 无 GUI 也能验服务自启"的关键。

### 7.2 L2a 接线（electron/main.cjs 集成）

- `main.cjs` require `./backend-spawn.cjs` + `app.whenReady` 调 `ensureBackend`（grep 断言调用点存在——铁律 0-2 WIRE CHECK）
- `before-quit` 调 `backend.stop()`（grep 断言）
- prod 分支 `loadFile(dist/renderer/index.html)`（grep 断言 `app.isPackaged` 分支存在）

### 7.3 L2b 降级

- 后端不可达 + spawn 失败 → main.cjs 显示离线页 + console.warn degraded（缺陷 A 修复后行为，不静默）
- renderer fetch 失败（后端 down）→ useStreaming catch → setError + phase='error'（[useStreaming.ts L238-241](electron-renderer/src/hooks/useStreaming.ts:238) 已有，回归确认）

### 7.4 L2c 边界

- 端口冲突：已有健康服务 → reused（不双开后端）
- 双引导：isPackaged=true（生产，双击安装包）vs false（开发，npm run electron:dev）分支互斥（grep 断言）
- renderer 非 Electron 环境（浏览器 dev）→ `window.electronAPI` 缺失 → base URL fallback '/'（[bridge.ts L19-21](electron-renderer/src/ipc/bridge.ts:19) isElectron 已有）

### 7.5 场景级（GS-01 增强，scripts/golden-scenarios/）

GS-01 现有 3 条契约断言（无 token 401 / 缺 teamId 400 / reports 200，[run.sh](scripts/golden-scenarios/GS-01-first-diagnosis/run.sh:7)）保持，新增断言组（Electron 产物存在性 + spawn 契约 + renderer 产物）——exit 0 全过 + evidence JSON 入库。

## 8. Wiring Verification

| 新 export / 变更 | 生产调用点（真实传递，测试调用不计） | grep 验证 |
|------|------|------|
| `ensureBackend`（electron/backend-spawn.cjs） | [electron/main.cjs](electron/main.cjs) `app.whenReady`（L107 附近集成点） | `grep -n "ensureBackend" electron/main.cjs` 非零 |
| `backend.stop` | [electron/main.cjs](electron/main.cjs) `app.on('before-quit')`（L152 附近） | `grep -n "\.stop()" electron/main.cjs` 非零 |
| renderer base URL（`getServerUrl`） | [useStreaming.ts](electron-renderer/src/hooks/useStreaming.ts:179) + [App.tsx](electron-renderer/src/App.tsx:49) fetch 调用 | `grep -n "getServerUrl\|apiBase" electron-renderer/src/` 非零 |
| `SYNOVA_DB_PATH` 注入 | [main.cjs](electron/main.cjs) spawn env（prod 分支）→ 后端 [src/config.ts:90](src/config.ts:90) 消费（只读） | 场景断言 grep config.ts:90 存在 |
| GS-01 新增断言组 | [run.sh](scripts/golden-scenarios/GS-01-first-diagnosis/run.sh) 场景脚本 | 场景 exit 0 + evidence 入库 |

> ⚠️ 铁律 0-2 WIRE CHECK 是硬门禁：`grep -rn "ensureBackend" electron/` — 零结果 = 未完成。测试调用不计（D331 WIRE CHECK 升级原文）。

## 9. Architecture Layer

**L1 交互层**（桌面端载体）。理由：
- Electron 主进程 = L1 交互层（窗口/托盘/通知），经 HTTP 调 L2 编排层 API（consult/reports/healthz）——符合铁律 39 "L1 只与 L2 通信"（main.cjs 现已有 checkServer → /api/healthz，无跨层）。
- backend-spawn.cjs 属 L1 的进程管理能力（拉起 L2 服务进程），不触碰 L3-L5。
- 渲染进程（renderer）= L1 的 UI 面，经 HTTP 消费 L2 接口，不直连 L4/L5（现有代码 fetch /api/* 即满足）。
- 不新增 src/ 文件（Win 领地），不产生跨层依赖。

## 10. Completion Standard（DS 与 dev doc 一一对应，禁重编号，缺项显式 descope——S-10）

1. **DS1**: `tests/electron/backend-spawn.test.ts` 全过（≥8 用例，§7.1 表，red 已证）
2. **DS2**: backend-spawn.cjs 契约实现——探活/spawn/重启限次/reused/degraded/stop 全路径（§3.5 契约字段全有）
3. **DS3**: main.cjs 集成——`app.whenReady` 调 ensureBackend + `before-quit` 调 stop + `app.isPackaged` 分支（grep 断言，§8）
4. **DS4**: 打包配置有效——`npx electron-builder --dir` 产出 `release/` 下 unpacked 产物（CI 机器判定）
5. **DS5**: renderer 构建产物存在——`npm run build`（renderer）产出 `dist/renderer/index.html` + vite proxy 18790 修复（缺陷 D）
6. **DS6**: renderer 接线——useStreaming/App.tsx fetch 带 base URL，生产态 main.cjs loadFile renderer 产物（缺陷 C 修复）
7. **DS7**: 双引导收敛——main.cjs isPackaged 分支互斥 + README/install 引导单一入口（L1-5）
8. **DS8**: 数据目录重定向——prod spawn env 注入 SYNOVA_DB_PATH=userData（L1-7 基础，零 src/ 改动）
9. **DS9**: GS-01 转绿——`bash scripts/golden-scenarios/GS-01-first-diagnosis/run.sh` exit 0 + evidence/GS-01-<date>.json 入库（含 Electron 产物断言组）
10. **DS10**: L1 验证点 ≥4 verified——1-1（打包产物）/ 1-4（服务自启 spawn 契约）/ 1-5（单一入口）/ 1-7（userData 数据目录）机器判定 + 证据进 product-lines
11. **DS11**: 本地（Mac）`npm run electron:build:mac` 产出 dmg + 安装 + 双击 → 服务自启 → 开窗（手动验证记录入 evidence，L1-3 证据链）
12. **DS12**: 全量 vitest 通过 + `as any`=0 + 12 组 pre-commit 全过 + 无 --no-verify + `git diff --name-only` 与写集一致
13. **DS13**: 完成报告含**决策记录**（§5.3 四决策点参考系与结论，S-12）——K3 可核
14. **DS14**: CI 绿（quality/test/architecture/control-tower-tests/integration-check/golden-case 各 job）+ `git log origin/main..HEAD` 为空（推送完成）

> 交付声明必须覆盖以上 DS1-DS14 全部并标注状态（✅/⏸/❌+理由）；禁止重编号/跳号/静默缺项（S-10，D331 审计教训）。
> 显式 descope：1-2（Windows 双击安装实测）、1-6（30 分钟计时）、1-8（K3 复核）为 founder-demo/K3 类验收点，非本任务代码交付——1-2 需 Win 环境实测（等 Win 侧配合或 CI windows runner），1-6 需创始人计时，1-8 归 K3。

## 11. Auth Doc References

| 引用 | 路径 |
|------|------|
| 派单（CTO 决策 + 5 问 + 红线） | docs/synova/coordination/派单-devdoc-20260823-D504-D505.md |
| 产品完成度 26 线（线 1 桌面端验收点） | docs/synova/product-lines/product-lines.yaml（L32-80） |
| 任务路由（electron/ 归 Mac DSH，src/ 归 Win） | docs/synova/coordination/TASK-ROUTING.md（§一） |
| 铁律（0-2/4/7/24/31/32/39/47/48） | AGENTS.md |
| GS 场景体系（运行契约 8 条 + 断言规范） | scripts/golden-scenarios/README.md |
| D255 打包历史（只规划未实测） | docs/plans/codex/implementation/SYNOVA-IMPL-D255-Electron-Packaging-v1-0-20260729.md |
| 健康检查端点（spawn 探活目标） | src/routes/healthz.ts（L323） |
| 数据目录重定向（SYNOVA_DB_PATH） | src/config.ts（L90） |
| Electron utilityProcess 官方文档 | https://www.electronjs.org/docs/latest/api/utility-process（编码 session 增强项参考） |

## 12. 自检清单

- [x] 派单 5 问全部回答（§5.3 决策 + §5.4 留接口 + §7 测试 + §10 DS）
- [x] 红线遵守：src/ 只读（服务自启 = spawn + 环境变量，零 src/ 改动）
- [x] 现状全部 grep/read 实测（main.cjs 153 行 / package.json 79 字节 / build-synova.cjs 72 行 / useStreaming L179 consult / config.ts L90 SYNOVA_DB_PATH / healthz L323）
- [x] 写集与派单建议一致 + 与 D505 零交集（verify-parallel 可查）
- [x] 决策参考已记录（§5.3，S-12）：四决策点均走双参考系且收敛
- [x] DS 与 dev doc 一一对应（DS1-14，S-10）；无 phantom 声称（S-11）
- [x] GS-01 诚实 RED 保持（契约级断言，不假装全链路绿）
- [x] 编码 session 待确认项显式列出（§5.4）
- [x] 不是凭记忆
