/**
 * electron-main.ts — SynovaAgent 桌面端主进程
 *
 * Phase 4.1: 系统托盘增强 — 三色状态角标 + 系统通知 + 右键菜单
 * - 托盘图标: 绿(正常) / 橙(未读) / 红(critical)
 * - 右键菜单: 打开、今日摘要、暂停通知2h、暂停至明早8:00、退出
 * - 关闭窗口 → hide() (不退出)
 * - critical 级别告警 → 系统 Notification
 */
import { app, BrowserWindow, Tray, Menu, shell, dialog, ipcMain, Notification } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as http from 'http';

let serverProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let notificationPaused = false;
let pauseUntil: number | null = null;

const PORT = process.env.PORT || '3000';
const SERVER_URL = `http://localhost:${PORT}`;
const RENDERER_DEV_URL = 'http://localhost:5173';
const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
const ASSETS_DIR = path.join(__dirname, 'assets');

// ═══ Tray 图标状态 ═══
// 使用内置图标+颜色叠加（无外部图片依赖）
type TrayState = 'normal' | 'unread' | 'critical';

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
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    title: 'Synova · 增长导航',
    backgroundColor: '#0f0f14', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'electron-renderer', 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL(RENDERER_DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'renderer', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

// ═══ Tray ═══

function updateTrayState(state: TrayState, unreadCount = 0): void {
  if (!tray) return;

  // 内联生成三色 16x16 图标数据（不依赖外部文件）
  const colors: Record<TrayState, string> = {
    normal: '#2ecc71',   // 绿
    unread: '#f39c12',   // 橙
    critical: '#e74c3c', // 红
  };
  const color = colors[state];

  // 使用 nativeImage 创建彩色圆点图标
  const { nativeImage } = require('electron');
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4); // RGBA
  const cx = size / 2, cy = size / 2, r = 5;

  // 解析 hex 颜色
  const hex = color.replace('#', '');
  const rCol = parseInt(hex.slice(0, 2), 16);
  const gCol = parseInt(hex.slice(2, 4), 16);
  const bCol = parseInt(hex.slice(4, 6), 16);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const alpha = dist <= r ? 255 : 0;
      const idx = (y * size + x) * 4;
      canvas[idx] = rCol;       // R
      canvas[idx + 1] = gCol;  // G
      canvas[idx + 2] = bCol;  // B
      canvas[idx + 3] = alpha; // A
    }
  }

  const img = nativeImage.createFromBuffer(canvas, { width: size, height: size });
  tray.setImage(img);

  // 更新 tooltip
  const labels: Record<TrayState, string> = {
    normal: 'SynovaAgent — 运行正常',
    unread: `SynovaAgent — ${unreadCount} 条未读通知`,
    critical: 'SynovaAgent — 发现严重告警',
  };
  tray.setToolTip(labels[state]);
}

function createTray(): void {
  try {
    tray = new Tray(path.join(__dirname, 'assets', 'tray-icon.png'));
  } catch {
    // 无图标时用内置生成
    tray = new Tray('');
  }

  updateTrayState('normal');

  const buildMenu = () => {
    const isPaused = notificationPaused || (pauseUntil !== null && Date.now() < pauseUntil);
    return Menu.buildFromTemplate([
      { label: '打开 Synova', click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        else { shell.openExternal(isDev ? RENDERER_DEV_URL : SERVER_URL); }
      }},
      { label: '今日摘要', click: () => {
        if (mainWindow) { mainWindow.webContents.send('navigate', 'summary'); mainWindow.show(); mainWindow.focus(); }
      }},
      { type: 'separator' },
      { label: isPaused ? '✅ 通知已暂停' : '暂停通知 2 小时', enabled: !isPaused, click: () => {
        notificationPaused = true;
        pauseUntil = Date.now() + 2 * 3600000;
        setTimeout(() => { notificationPaused = false; pauseUntil = null; }, 2 * 3600000);
        tray?.setContextMenu(buildMenu());
      }},
      { label: isPaused ? '✅ 通知已暂停至明早' : '暂停至明早 8:00', enabled: !isPaused, click: () => {
        const now = new Date();
        const tomorrow8 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0, 0);
        notificationPaused = true;
        pauseUntil = tomorrow8.getTime();
        setTimeout(() => { notificationPaused = false; pauseUntil = null; }, tomorrow8.getTime() - now.getTime());
        tray?.setContextMenu(buildMenu());
      }},
      { type: 'separator' },
      { label: '关于', click: () => dialog.showMessageBox({
        title: 'SynovaAgent', message: '组织数字孪生诊断 Agent',
        detail: `版本: ${app.getVersion()}\n本地服务: ${SERVER_URL}`,
      })},
      { type: 'separator' },
      { label: '退出', click: () => { isQuitting = true; app.quit(); }},
    ]);
  };

  tray.setToolTip('SynovaAgent — 组织诊断服务运行中');
  tray.setContextMenu(buildMenu());
  tray.on('double-click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
}

// ═══ 系统通知 ═══

function showSystemNotification(title: string, body: string, notificationId?: string): void {
  if (notificationPaused || (pauseUntil !== null && Date.now() < pauseUntil)) return;

  const notif = new Notification({ title, body, urgency: 'critical' });
  notif.on('click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    mainWindow?.webContents.send('notification:click', notificationId || '');
  });
  notif.show();
}

// ═══ IPC ═══

function setupIPC(): void {
  ipcMain.on('window:minimize-to-tray', () => mainWindow?.hide());
  ipcMain.handle('app:get-version', () => app.getVersion());

  // 渲染进程通知主进程: 更新托盘状态
  ipcMain.on('tray:update-state', (_event, state: TrayState, count: number) => {
    updateTrayState(state, count);
  });

  // 渲染进程请求: 弹出系统通知
  ipcMain.on('notify:show', (_event, title: string, body: string, id?: string) => {
    showSystemNotification(title, body, id);
  });

  // 渲染进程请求: 暂停通知
  ipcMain.on('notify:pause', (_event, durationMs: number) => {
    notificationPaused = true;
    pauseUntil = Date.now() + durationMs;
    setTimeout(() => { notificationPaused = false; pauseUntil = null; }, durationMs);
  });

  // 渲染进程请求: 取消暂停
  ipcMain.on('notify:resume', () => {
    notificationPaused = false;
    pauseUntil = null;
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
