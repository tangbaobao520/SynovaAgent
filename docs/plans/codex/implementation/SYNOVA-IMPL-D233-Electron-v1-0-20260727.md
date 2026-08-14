<!-- SYNOVA-IMPL-D233 v1.0 | 2026-07-27 | Auth Doc #16 Ch1 -->
# SynovaAgent -- D233 Electron 桌面应用封装 v1.0
> D111 交付了 3 个文件但无法启动。D233 补齐缺失。

## 权威文档验证（铁律 0-3）
来源: docs/synova/research/企业多用户部署与ima知识对接-20260721/SYNOVA-RESEARCH-第一章-企业多用户架构-v1-0-20260721.md
- 1.1: Electron 客户端作为瘦客户端通过 HTTP API 远程连接
- 1.2: 职责——内置浏览器加载 Web 界面 / 系统托盘驻留 + 桌面通知 / 不运行诊断逻辑
- 1.3: Server 监听 0.0.0.0，端口通过 PORT 环境变量配置

代码验证:
- electron/main.js (77行) + electron/preload.js (11行) + electron/config.json (4行) 文件存在
- node_modules/electron/ 不存在 -- electron 未安装
- electron/icon.png 不存在 -- Tray 会崩溃
- config.json serverUrl = localhost:3000, 实际端口 = 18790 (src/config-file.ts port: 18790)

## Q0-Q4
Q0: Synova Electron 瘦客户端。D111 代码逻辑正确但缺运行时依赖和资源文件。
Q1: Electron Quick Start 要求 devDependencies 中有 electron；new Tray() 缺文件会抛出 Error；客户端不自行启动 Server（1.2 明确）。
Q2: 做——安装 electron + electron-builder；创建 icon.png 占位；修正端口 3000→18790；Tray try/catch 降级；Server 可达性检测→友好错误页。不做——exe 打包、开机自启、离线缓存。
Q3: 入口 npm run electron:dev → Server 已启动显示 login.html / Server 未启动显示内置错误页
Q4: 降级——Server 不可达 → 错误页 + log.warn；icon.png 缺失 → 跳过 Tray + log.warn。L1 手动验证（Electron .js 不能纳入 vitest）。

## 改动清单

### 1. package.json — 添加依赖
devDependencies 追加: "electron": "^33.0.0", "electron-builder": "^25.0.0"
安装: npm install --save-dev electron@^33.0.0 electron-builder@^25.0.0

### 2. electron/config.json — 端口修正
serverUrl: "http://localhost:3000" → "http://localhost:18790"

### 3. electron/icon.png — 新建占位图标
32x32 纯色 PNG，最小有效 68 字节 PNG，可使用 Node.js Buffer 生成或从 assets/ 复制

### 4. electron/main.js — Tray 降级 + Server 可达性检测
(a) Tray new Tray(...) 包裹 try/catch——文件缺失时跳过 + log.warn
(b) BrowserWindow icon 属性 try/catch 检查文件存在性
(c) app.whenReady 内 loadURL 前调用 checkServer(SERVER_URL) GET /api/healthz
(d) 新增 checkServer(url): http.get 5s 超时→boolean
(e) 新增 getOfflineHTML(serverUrl): 内置错误页 HTML，显示 "Synova Server 未启动" + npm run dev 提示
(f) 声明 app.isQuitting 标记

### 5. build-synova.js — 修正打包入口
files 数组: electron-main.ts → electron/main.js
追加: electron/preload.js, electron/config.json, electron/icon.png

## 测试要求
| # | 场景 | 验证 |
|---|------|------|
| 1 | npm run electron:dev 启动 | 窗口打开，无崩溃 |
| 2 | Server 已运行时 | 加载 login.html |
| 3 | Server 未运行时 | 显示"Synova Server 未启动" |
| 4 | icon.png 存在 | 托盘图标出现 |
| 5 | icon.png 缺失 | 静默跳过 + terminal warn |
| 6 | 关闭窗口 | 隐藏到托盘 |
| 7 | P0 轮询 (Server 已运行) | 5s 后无异常 |

## 接线验证
| 文件 | 调用方 | 验证 |
|------|--------|------|
| config.json serverUrl:18790 | main.js:11 require() | 手动启动 |
| icon.png | main.js:24,38 Tray+BrowserWindow | Test-Path |
| electron devDep | npm run electron:dev | npx electron --version |

## 完成标准
| 标准 | 验证 |
|------|------|
| npx electron --version 输出版本号 | 终端 |
| npm run electron:dev 无崩溃 | 手动 |
| Server 启动时显示登录页 | 视觉 |
| Server 未启动时错误提示 | 视觉 |
| Tray 降级无崩溃 | 日志 |
| tsc --noEmit 零新增 (.js 不受检) | CI |
