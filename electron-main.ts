/**
 * electron-main.ts — SynovaAgent 桌面端主进程
 *
 * Phase 0.5: 加载 Electron 渲染进程（React + Vite）而非浏览器。
 *
 * - 开发模式: 加载 Vite dev server (localhost:5173)
 * - 生产模式: 加载构建产物 (dist/renderer/index.html)
 *
 * 架构:
 * ├── Electron 主进程 (electron-main.ts)
 * ├── Express 子进程 (src/server.ts)
 * └── 渲染进程 (electron-renderer/)
 *
 * 构建: npx electron-builder --config build-synova.js
 */
import { app, BrowserWindow, Tray, Menu, shell, dialog, ipcMain } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as http from 'http';

let serverProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const PORT = process.env.PORT || '3000';
const SERVER_URL = `http://localhost:${PORT}`;
const RENDERER_DEV_URL = 'http://localhost:5173';
const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

// ═══ Server Lifecycle ═══

function startServer(): void {
  const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx');
  serverProcess = spawn('node', ['--require', 'tsx/cjs', path.join(__dirname, 'src', 'server.ts')], {
    cwd: __dirname,
    env: { ...process.env, PORT, DEV_MODE: 'true' },
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

// ═══ Window ═══

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Synova · 增长导航',
    backgroundColor: '#0f0f14',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'electron-renderer', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL(RENDERER_DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'renderer', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (!(app as any).isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

// ═══ IPC ═══

function setupIPC(): void {
  ipcMain.on('window:minimize-to-tray', () => mainWindow?.hide());
  ipcMain.on('notification:click', (_event, notificationId: string) => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  ipcMain.handle('app:get-version', () => app.getVersion());
}

// ═══ Tray ═══

function createTray(): void {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  try {
    tray = new Tray(iconPath);
  } catch {
    tray = new Tray(path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.d.ts'));
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: '打开 Synova', click: () => {
      if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
      else { shell.openExternal(isDev ? RENDERER_DEV_URL : SERVER_URL); }
    }},
    { label: '查看健康状态', click: () => shell.openExternal(`${SERVER_URL}/health`) },
    { type: 'separator' },
    { label: '关于', click: () => dialog.showMessageBox({ title: 'SynovaAgent', message: '组织数字孪生诊断 Agent', detail: `版本: ${app.getVersion()}` }) },
    { type: 'separator' },
    { label: '退出', click: () => { (app as any).isQuitting = true; app.quit(); } },
  ]);

  tray.setToolTip('SynovaAgent — 组织诊断服务运行中');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
}

// ═══ App Lifecycle ═══

app.whenReady().then(async () => {
  console.log('[synova] Starting Express server...');
  startServer();

  const ready = await waitForServer();
  if (ready) {
    console.log(`[synova] Server ready at ${SERVER_URL}`);
    setupIPC();
    createWindow();
    createTray();
  } else {
    dialog.showErrorBox('启动失败', 'SynovaAgent 服务未能在 30 秒内启动。');
    app.quit();
  }
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => stopServer());

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}
