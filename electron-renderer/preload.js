/**
 * preload.js — Electron 预加载脚本 (Phase 4.1)
 *
 * 通过 contextBridge 暴露安全的 IPC API 到渲染进程。
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口
  minimizeToTray: () => ipcRenderer.send('window:minimize-to-tray'),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),

  // 通知 (Phase 4.1)
  showNotification: (title, body, id) => ipcRenderer.send('notify:show', title, body, id),
  pauseNotifications: (durationMs) => ipcRenderer.send('notify:pause', durationMs),
  resumeNotifications: () => ipcRenderer.send('notify:resume'),
  updateTrayState: (state, count) => ipcRenderer.send('tray:update-state', state, count),
  onNotificationClick: (callback) => {
    ipcRenderer.on('notification:click', (_event, id) => callback(id));
  },
  onNavigate: (callback) => {
    ipcRenderer.on('navigate', (_event, view) => callback(view));
  },
});
