/**
 * electron/preload.cjs — Electron 预加载脚本 (D111 + D602 IPC 收敛)
 *
 * 安全地暴露有限的 API 到渲染进程（contextIsolation: true + nodeIntegration: false，
 * main.cjs webPreferences 现状保持）。
 *
 * D602 契约（spec §5.2-A 逐方法，铁律 47）:
 *   暴露面 8 方法 ≡ electron-renderer/src/ipc/bridge.ts ElectronAPI 接口
 *   ≡ main.cjs ipcMain 通道覆盖（tests/electron/ipc-contract.test.ts 用例 1-3 三方物理锁定）。
 *
 * 安全边界（founder Q5 / Anthropic 基线）:
 *   - 全部通道名为本文件 CHANNELS 字面量常量，无动态通道
 *   - main 侧每个 handler 校验后才消费（renderer 半可信）
 *   - 无文件系统/进程/shell 类方法（openExternal/窗口控制零暴露）
 *   - on* 订阅返回退订函数（ipcRenderer.off 移除同一 listener——防 React effect 重挂载双订阅）
 */
const { contextBridge, ipcRenderer } = require('electron');
const config = require('./config.json');

/** 通道名常量（ipc-contract 用例 3/5 解析锚点；禁止动态拼接通道名） */
const CHANNELS = {
  APP_GET_VERSION: 'app:get-version',
  TRAY_UPDATE_STATE: 'tray:update-state',
  NOTIFY_SHOW: 'notify:show',
  PUSH_NOTIFICATION: 'push-notification',
  NOTIFICATION_CLICK: 'notification:click',
  NAVIGATE: 'navigate',
};

/**
 * subscribe — 推送类通道订阅辅助（D602）
 * @input  channel: CHANNELS 字面量之一；callback: payload 回调
 * @output 退订函数——ipcRenderer.off(channel, listener) 精确移除本订阅
 * @why    App.tsx 订阅 effect 挂载一次 + cleanup 退订，重挂载不产生双订阅双通知
 */
function subscribe(channel, callback) {
  const listener = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.off(channel, listener);
}

contextBridge.exposeInMainWorld('electronAPI', {
  /** 同步读 serverUrl（既有；无 IPC 直读 config，缺省 :18790） */
  getServerUrl: () => config.serverUrl || 'http://localhost:18790',
  /** 同步读 config 浅拷贝（既有） */
  getConfig: () => ({ ...config }),
  /** @output Promise<string> 应用版本（main 侧 ipcMain.handle('app:get-version') → app.getVersion()） */
  getAppVersion: () => ipcRenderer.invoke(CHANNELS.APP_GET_VERSION),
  /** @input state ∈ 'normal'|'unread'|'critical' + count 正整数（main 侧枚举/类型校验，非法 warn+忽略） */
  updateTrayState: (state, count) => ipcRenderer.send(CHANNELS.TRAY_UPDATE_STATE, state, count),
  /** @input title/body（main 侧字符串化+截断 200）；通知被点击 → main send('notification:click', id) */
  showNotification: (title, body, id) => ipcRenderer.send(CHANNELS.NOTIFY_SHOW, title, body, id),
  /** main P0 轮询推送（checkP0Alerts red 时）→ renderer 通知面板；@output 退订函数 */
  onPushNotification: (callback) => subscribe(CHANNELS.PUSH_NOTIFICATION, callback),
  /** 系统通知被点击（main show+focus 后 send）；@output 退订函数 */
  onNotificationClick: (callback) => subscribe(CHANNELS.NOTIFICATION_CLICK, callback),
  /** 托盘菜单导航（view: 'chat'|'notifications'）；@output 退订函数 */
  onNavigate: (callback) => subscribe(CHANNELS.NAVIGATE, callback),
});
