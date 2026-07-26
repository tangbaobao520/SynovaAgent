/**
 * electron/main.js — Electron 瘦客户端主进程 (D111)
 *
 * 系统托盘驻留 + 桌面通知推送 + Server 地址配置。
 * Electron 不运行任何诊断逻辑——只是 Server 的"遥控器"。
 */
const { app, BrowserWindow, Tray, Menu, Notification } = require('electron');
const path = require('path');

let mainWindow, tray;
const config = require('./config.json');
const SERVER_URL = config.serverUrl || 'http://localhost:3000';
const POLL_INTERVAL = config.pollInterval || 300000; // 5 min

app.whenReady().then(() => {
  // ── 主窗口 ──
  mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'icon.png'),
  });

  // 加载登录页
  mainWindow.loadURL(`${SERVER_URL}/app/login.html`);

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // ── 系统托盘 ──
  tray = new Tray(path.join(__dirname, 'icon.png'));
  tray.setToolTip('SynovaAgent');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => mainWindow.show() },
    { label: 'Admin Workbench', click: () => mainWindow.loadURL(`${SERVER_URL}/app/admin.html`) },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));

  tray.on('double-click', () => mainWindow.show());

  // ── P0 告警轮询 ──
  setInterval(checkP0Alerts, POLL_INTERVAL);
  setTimeout(checkP0Alerts, 5000); // 首次延迟 5s
});

async function checkP0Alerts() {
  try {
    const res = await fetch(`${SERVER_URL}/api/cockpit/data`);
    const data = await res.json();
    const signals = data.signals || {};
    const redCount = Object.values(signals).filter(s => s.status === 'red').length;
    if (redCount > 0) {
      new Notification({
        title: 'Synova P0 Alert',
        body: `${redCount} critical ${redCount > 1 ? 'issues' : 'issue'} detected — check dashboard.`,
      }).show();
    }
  } catch (err) {
    // Server 不可达 — 静默降级
    console.warn('[electron] P0 check failed:', err.message);
  }
}

app.on('before-quit', () => { app.isQuitting = true; });
