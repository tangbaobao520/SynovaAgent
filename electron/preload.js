/**
 * electron/preload.js — Electron 预加载脚本 (D111)
 *
 * 安全地暴露有限的 Node.js API 到渲染进程。
 * contextIsolation: true — 不直接暴露 Node.js 全局变量。
 */
const { contextBridge } = require('electron');
const config = require('./config.json');

contextBridge.exposeInMainWorld('electronAPI', {
  getServerUrl: () => config.serverUrl || 'http://localhost:3000',
  getConfig: () => ({ ...config }),
});
