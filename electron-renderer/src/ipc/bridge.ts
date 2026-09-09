/**
 * ipc/bridge.ts — Electron IPC 桥接 (Phase 4.1 + D602 收敛)
 *
 * D602: 接口收敛 10→8（spec §5.2-A 三方契约单源，铁律 37/47）:
 *   - 删 3 个全仓零消费方死接口与同名 wrapper（grep 零引用已证，名字本身不再入仓库——DS7 物理清零）
 *   - on* 订阅方法返回退订函数（preload ipcRenderer.off——防 React effect 重挂载双订阅）
 *   - 增 onPushNotification（main checkP0Alerts → renderer 通知面板可见）
 * 契约: preload 暴露面 ≡ 本接口 ≡ main ipcMain 通道（tests/electron/ipc-contract.test.ts 用例 1-3 物理锁定）。
 */
export interface PushNotificationPayload {
  title: string;
  body: string;
  id?: string;
}

/** 托盘菜单导航目标（main.cjs Tray 菜单 send('navigate', view)） */
export type NavigateView = 'chat' | 'notifications';

export interface ElectronAPI {
  /** 同步读 config.serverUrl（既有；无 IPC，desktop-build.test.ts 断言保留） */
  getServerUrl: () => string;
  /** 同步读 config 浅拷贝（既有；无 IPC） */
  getConfig: () => Record<string, unknown>;
  /** invoke 'app:get-version' → Promise\<string\>；失败降级 '0.1.0'（wrapper） */
  getAppVersion: () => Promise<string>;
  /** send 'notify:show'——title/body main 侧截断 200；点击 → 'notification:click' */
  showNotification: (title: string, body: string, id?: string) => void;
  /** send 'tray:update-state'——state 枚举/count 正整数 main 侧校验（非法 warn+忽略） */
  updateTrayState: (state: 'normal' | 'unread' | 'critical', count?: number) => void;
  /** on 'push-notification'（main P0 轮询推送）→ @output 退订函数 */
  onPushNotification: (callback: (n: PushNotificationPayload) => void) => () => void;
  /** on 'notification:click'（系统通知被点击）→ @output 退订函数 */
  onNotificationClick: (callback: (id: string) => void) => () => void;
  /** on 'navigate'（托盘菜单导航）→ @output 退订函数 */
  onNavigate: (callback: (view: NavigateView) => void) => () => void;
}

declare global {
  interface Window { electronAPI?: ElectronAPI; }
}

export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI;
}

export async function getAppVersion(): Promise<string> {
  try { return await window.electronAPI?.getAppVersion() || '0.1.0'; } catch (err) { console.warn('[bridge] getAppVersion 失败 — 降级 0.1.0:', err); return '0.1.0'; }
}

/** 弹出系统通知（main 侧截断 + 实例化 try/catch；electronAPI 缺失静默跳过——非 Electron 环境正常路径） */
export function showNotification(title: string, body: string, id?: string): void {
  window.electronAPI?.showNotification(title, body, id);
}

/** 更新托盘状态（main 侧枚举/类型校验，非法忽略） */
export function updateTrayState(state: 'normal' | 'unread' | 'critical', count?: number): void {
  window.electronAPI?.updateTrayState(state, count);
}

/** 订阅 main 推送通知 → 退订函数（electronAPI 缺失 → 空退订，订阅方 effect 零负担） */
export function onPushNotification(callback: (n: PushNotificationPayload) => void): () => void {
  return window.electronAPI?.onPushNotification(callback) ?? (() => {});
}

/** 订阅系统通知点击 → 退订函数 */
export function onNotificationClick(callback: (id: string) => void): () => void {
  return window.electronAPI?.onNotificationClick(callback) ?? (() => {});
}

/** 订阅托盘菜单导航 → 退订函数 */
export function onNavigate(callback: (view: NavigateView) => void): () => void {
  return window.electronAPI?.onNavigate(callback) ?? (() => {});
}
