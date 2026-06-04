/**
 * electron-main.ts — SynovaAgent 桌面端主进程
 *
 * 方案 A: Electron 桌面应用
 * ├── 启动 Express 服务器 (spawn 子进程)
 * ├── 系统托盘图标 + 菜单
 * ├── 自动打开浏览器到 http://localhost:3000
 * └── 应用退出时清理子进程
 *
 * 基于 Novis box/main.ts 架构模式复用。
 * 
 * 构建: npx electron-builder --config build-synova.js
 * 产物: release/SynovaAgent-{version}-win32-x64/SynovaAgent.exe
 */
import { app, BrowserWindow, Tray, Menu, shell, dialog } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as http from 'http';

let serverProcess: ChildProcess | null = null;
let tray: Tray | null = null;
const PORT = process.env.PORT || '3000';
const SERVER_URL = `http://localhost:${PORT}`;

// ═══ Server Lifecycle ═══

function startServer(): void {
  const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx');
  serverProcess = spawn('node', ['--require', 'tsx/cjs', path.join(__dirname, 'src', 'server.ts')], {
    cwd: __dirname,
    env: { ...process.env, PORT, DEV_MODE: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout?.on('data', (d: Buffer) => {
    const msg = d.toString().trim();
    if (msg) console.log('[synova-server]', msg);
  });
  serverProcess.stderr?.on('data', (d: Buffer) => {
    console.error('[synova-server]', d.toString().trim());
  });
  serverProcess.on('exit', (code) => {
    console.log(`[synova] Express server exited (code ${code})`);
  });
}

function stopServer(): void {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    setTimeout(() => { if (serverProcess && !serverProcess.killed) serverProcess.kill('SIGKILL'); }, 3000);
    serverProcess = null;
  }
}

// ═══ Wait for server readiness ═══

function waitForServer(maxRetries = 30, intervalMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    let retries = 0;
    const check = () => {
      http.get(`${SERVER_URL}/health`, (res) => {
        if (res.statusCode === 200) resolve(true);
        else { retries++; retries < maxRetries ? setTimeout(check, intervalMs) : resolve(false); }
      }).on('error', () => {
        retries++;
        retries < maxRetries ? setTimeout(check, intervalMs) : resolve(false);
      });
    };
    check();
  });
}

// ═══ Tray ═══

function createTray(): void {
  // 使用 16x16 透明 PNG (内嵌 base64 占位符)
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  try {
    tray = new Tray(iconPath);
  } catch {
    // 无图标时使用原生空托盘
    tray = new Tray(path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.d.ts')); // fallback
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: '打开 SynovaAgent', click: () => shell.openExternal(SERVER_URL) },
    { label: '查看健康状态', click: () => shell.openExternal(`${SERVER_URL}/health`) },
    { type: 'separator' },
    { label: '关于', click: () => dialog.showMessageBox({ title: 'SynovaAgent', message: '组织数字孪生诊断 Agent', detail: `版本: ${app.getVersion()}\n本地服务: ${SERVER_URL}` }) },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setToolTip('SynovaAgent — 组织诊断服务运行中');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => shell.openExternal(SERVER_URL));
}

// ═══ App Lifecycle ═══

app.whenReady().then(async () => {
  console.log('[synova] Starting Express server...');
  startServer();

  const ready = await waitForServer();
  if (ready) {
    console.log(`[synova] Server ready at ${SERVER_URL}`);
    createTray();
    // 自动打开浏览器
    shell.openExternal(SERVER_URL);
  } else {
    console.error('[synova] Server failed to start within 30s');
    dialog.showErrorBox('启动失败', 'SynovaAgent 服务未能在 30 秒内启动。请检查端口 3000 是否被占用。');
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // 托盘应用不自动退出
});

app.on('before-quit', () => {
  stopServer();
});

// 单实例锁
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    shell.openExternal(SERVER_URL);
  });
}

// 防止多次退出
declare module 'electron' {
  interface App { isQuitting?: boolean }
}
