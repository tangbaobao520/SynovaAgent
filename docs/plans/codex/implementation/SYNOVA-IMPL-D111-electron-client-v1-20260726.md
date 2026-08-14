# SynovaAgent -- D111 Electron 瘦客户端 实施方案 v1.0

> 2026-07-26 | 权威文档 #16 第一章 — 企业多用户部署
> **10/31 客户截止线。此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`app/` 目录存在（dashboard.html/admin.html/loops.html/report.html/login.html），`src/server.ts` 存在，`app/js/api-client.js` 存在（JWT 自动附带）
- [x] Get-Content 读取：权威文档 #16 第一章 L48-59 — "Electron 客户端职责（纯交互层）：系统托盘驻留 + 桌面通知推送 + 离线缓存 + 自动更新。不跑任何诊断逻辑——只是 Server 的 '遥控器'。" L31-34 — 架构图：多个 Electron 客户端通过 HTTP API 连接同一个 Server
- [x] Select-String 验证：server.ts L274 — `express.static('app')` 静态文件服务已就绪。`app/js/auth.js` + `app/js/shell.js` + `app/js/api-client.js` 全部存在
- [x] 引用 — D102-D105 已完成（Auth+Enterprise+ima+Knowledge），D108 已完成（Admin UI），D96 shell 复用模式已建立

---

## 问题根因

Synova 当前是纯 Web 应用——用户必须手动打开浏览器访问 `http://localhost:18790/app/dashboard.html`。没有桌面客户端。10/31 客户验收需要一个可安装的桌面应用——系统托盘驻留、P0 告警桌面通知、自动连接企业 Server。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 企业多用户——Electron 瘦客户端。将现有 Web 界面（dashboard/admin/loops/report/login）包装为 Electron 窗口。追加系统托盘 + P0 通知 + Server 地址配置。Electron 不运行任何诊断逻辑——所有哨兵/诊断/Goal 处理都在 Server 端。

### Q1：调研
- Electron 架构：`main.js`（主进程——窗口管理/托盘/通知）+ `preload.js`（预加载——暴露 Node API）+ 加载 `app/` 目录下现有 HTML
- 现有 Web 页面：dashboard.html / admin.html / loops.html / report.html / login.html
- Server 地址配置：存储在 `electron/config.json` 或环境变量中
- P0 通知源：D213/D220 控制塔仪表盘可提供 P0 告警——Electron 定时轮询 `/api/cockpit/data` 获取 P0 计数→系统通知

### Q2：范围
- 最小：(A) `electron/main.js`——窗口管理+托盘+通知 (B) `electron/preload.js`——安全暴露 API (C) `electron/config.json`——Server 地址配置 (D) `package.json`——追加 electron 依赖+启动脚本
- 不做：不实现自动更新（MVP）、不实现离线缓存（Phase 2）、不实现 Electron 打包（先 dev 模式运行）

### Q3：验收
- 入口：`npm run electron` → Electron 窗口打开 → 显示登录页 → 登录后跳转 dashboard
- 交互：系统托盘图标常驻 → 右键菜单（打开/退出）→ P0 告警 → 桌面通知弹出
- 结果：客户端通过 HTTP API 连接 Server——不运行任何本地诊断逻辑

### Q4：契约与测试
- @input：Server 地址（`electron/config.json`）
- @output：Electron 窗口 + 系统托盘
- @degraded：Server 不可达 → 显示"连接失败"+ Retry 按钮
- 测试：窗口加载(1) + 托盘显示(1) + Server 不可达降级(1) = 3 tests

---

## 构建内容

### 1. electron/main.js（新建，约 80 行）

```javascript
const { app, BrowserWindow, Tray, Menu, Notification } = require('electron');
const path = require('path');

let mainWindow, tray;
const SERVER_URL = require('./config.json').serverUrl || 'http://localhost:18790';

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({ width: 1280, height: 800, webPreferences: { preload: path.join(__dirname, 'preload.js') } });
  mainWindow.loadURL(`${SERVER_URL}/app/login.html`);
  
  tray = new Tray(path.join(__dirname, 'icon.png'));
  tray.setToolTip('SynovaAgent');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
  
  // 每 5 分钟轮询 P0 告警
  setInterval(checkP0Alerts, 300000);
});

async function checkP0Alerts() {
  try {
    const res = await fetch(`${SERVER_URL}/api/cockpit/data`);
    const data = await res.json();
    const p0Count = Object.values(data.signals || {}).filter(s => s.status === 'red').length;
    if (p0Count > 0) new Notification({ title: 'Synova P0 Alert', body: `${p0Count} critical issues detected` }).show();
  } catch(e) { /* degraded */ }
}
```

### 2. electron/preload.js（新建，约 15 行）

```javascript
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  getServerUrl: () => require('./config.json').serverUrl,
});
```

### 3. electron/config.json（新建，约 5 行）

```json
{ "serverUrl": "http://localhost:18790" }
```

### 4. 修改 package.json — 追加依赖+脚本

```json
"scripts": { "electron": "electron electron/main.js" },
"devDependencies": { "electron": "^28.0.0" }
```

---

## 不做什么

- 不实现自动更新
- 不实现离线缓存
- 不修改现有 Web 页面逻辑
- Electron 不执行任何哨兵/诊断/Goal 处理

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- `npm run electron` → Electron 窗口加载登录页
- 系统托盘图标显示 + 右键菜单正常
- Server 不可达 → "连接失败" + Retry
- 3 个测试

---

## 完成标准

```
[ ] electron/main.js: 窗口管理 + 托盘 + P0 通知轮询
[ ] electron/preload.js: 安全 API 暴露
[ ] electron/config.json: Server 地址配置
[ ] package.json: electron 依赖 + 脚本
[ ] 降级: Server 不可达 → "连接失败" + Retry
[ ] ≥3 个测试
```
