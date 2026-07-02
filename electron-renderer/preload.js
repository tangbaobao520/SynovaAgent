/**
 * preload.js — Electron 预加载脚本 (Plain JS)
 *
 * Phase 0.5: 窗口最小化到托盘
 * Phase 4+: 通知推送、免打扰
 *
 * 使用 plain JS 是因为 Electron preload 不经过 tsx 编译。
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimizeToTray: () => ipcRenderer.send('window:minimize-to-tray'),
  notificationClick: (callback) => {
    ipcRenderer.on('notification:click', (_event, notificationId) => callback(notificationId));
  },
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
});
