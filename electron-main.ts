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
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as http from 'http';
import * as fs from 'fs';
import { runStartupChecks } from './src/deploy/startup-check';
import { checkSchemaCompatibility } from './src/deploy/schema-version';

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
const STATE_FILE = path.join(app.getPath('userData'), 'synova-state.json');

// ═══ Phase 5.1: autoUpdater 配置 ═══
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// ═══ App State 保存/恢复 ═══
interface AppState {
  activeOrgId?: string;
  lastMsgId?: string;
  unreadCount?: number;
  savedAt: string;
}

function saveAppState(state: AppState): void {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('[synova] Failed to save state:', err);
  }
}

function restoreAppState(): AppState | null {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    console.warn('[synova] Failed to restore state file, starting fresh');
    return null;
  }
}

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
      { label: '检查更新', click: () => {
        autoUpdater.checkForUpdates().catch((err: Error) => {
          dialog.showErrorBox('检查更新失败', err.message);
        });
        dialog.showMessageBox({ title: '检查更新', message: '正在检查更新...' });
      }},
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

  // Phase 5.1: 强制检查更新
  ipcMain.handle('update:check', async () => {
    try {
      await autoUpdater.checkForUpdates();
      return { checking: true };
    } catch (err: unknown) {
      return { checking: false, error: String(err) };
    }
  });

  // Phase 5.1: 安装更新并重启
  ipcMain.on('update:install', () => {
    saveAppState({ activeOrgId: '', lastMsgId: '', unreadCount: 0, savedAt: new Date().toISOString() });
    autoUpdater.quitAndInstall();
  });

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

// ═══ Phase 5.1: AutoUpdater 事件 ═══

autoUpdater.on('checking-for-update', () => {
  console.log('[synova] Checking for updates...');
});

autoUpdater.on('update-available', (info) => {
  console.log(`[synova] Update available: ${info.version}`);
  // 下载更新
  autoUpdater.downloadUpdate().catch((err: Error) => {
    console.error('[synova] Download failed:', err.message);
  });
});

autoUpdater.on('update-not-available', () => {
  console.log('[synova] No updates available.');
});

autoUpdater.on('download-progress', (progress) => {
  if (progress.percent % 25 === 0) { // 每 25% 日志一次
    console.log(`[synova] Download progress: ${Math.round(progress.percent)}%`);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log(`[synova] Update ${info.version} downloaded, checking schema compatibility...`);

  // D48: 安装前执行 schema 兼容性检查
  // 在生产环境中, migrations 从新版本的迁移文件读取。
  // 这里先做空值安全检查 — 如果新版本包提供了 migrations 文件, 后续可注入。
  try {
    const schemaResult = checkSchemaCompatibility([]);
    if (!schemaResult.compatible) {
      console.warn(`[synova] Schema 不兼容 — 阻止升级: ${schemaResult.blockedReason}`);
      try {
        const notif = new Notification({
          title: '升级已阻止',
          body: `版本 ${info.version} 因 Schema 不兼容未能自动安装。${schemaResult.blockedReason || '请联系管理员。'}`,
          urgency: 'critical',
        });
        notif.show();
      } catch (notifErr) {
        console.error('[synova] 升级阻止通知失败:', notifErr);
      }
      return;
    }
  } catch (err: unknown) {
    // 检查本身失败不应阻断安装 — 降级为警告
    console.warn(`[synova] Schema 检查异常 (降级继续安装): ${(err as Error)?.message || String(err)}`);
  }

  // 系统通知: 新版本就绪
  try {
    const notif = new Notification({
      title: 'Synova 更新就绪',
      body: `版本 ${info.version} 已下载。点击重启以安装更新。`,
      urgency: 'critical',
    });
    notif.on('click', () => {
      // 保存当前状态
      const state = restoreAppState() || {};
      saveAppState({ ...state, savedAt: new Date().toISOString() });
      // 退出并安装
      autoUpdater.quitAndInstall();
    });
    notif.show();
  } catch (err) {
    console.error('[synova] Update notification failed:', err);
  }
});

autoUpdater.on('error', (err) => {
  console.error('[synova] Auto-updater error:', err.message);
});

app.whenReady().then(async () => {
  // D47: 首次启动检查 — 在 startServer 前执行
  const startupResult = await runStartupChecks();
  if (startupResult.failed.length > 0) {
    dialog.showErrorBox('启动失败', '数据库初始化失败。请检查数据目录和数据库文件。');
    app.quit();
    return;
  }
  for (const w of startupResult.warnings) {
    console.warn(`[synova] 启动检查警告 [${w.name}]: ${w.detail || ''}`);
  }

  console.log('[synova] Starting Express server...');
  startServer();

  const ready = await waitForServer();
  if (ready) {
    console.log(`[synova] Server ready at ${SERVER_URL}`);
    setupIPC();
    createWindow();
    createTray();

    // Phase 5.1: 启动时检查更新（非开发模式）
    if (!isDev) {
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch((err: Error) => {
          console.error('[synova] Update check failed:', err.message);
        });
      }, 5000); // 延迟 5 秒，确保服务器就绪

      // 24 小时周期检查
      setInterval(() => {
        autoUpdater.checkForUpdates().catch((err: Error) => {
          console.error('[synova] Periodic update check failed:', err.message);
        });
      }, 86_400_000); // 24h

      // 恢复保存的状态
      const savedState = restoreAppState();
      if (savedState) {
        console.log(`[synova] Restored state: org=${savedState.activeOrgId}, unread=${savedState.unreadCount}`);
      }
    }
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
