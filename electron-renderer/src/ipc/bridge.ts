/**
 * ipc/bridge.ts — Electron IPC 桥接
 *
 * 渲染进程通过 preload.ts 暴露的 window.electronAPI 与主进程通信。
 * Phase 0.5: 窗口操作（最小化到托盘）
 * Phase 4+: 通知推送、免打扰
 */
export interface ElectronAPI {
  minimizeToTray: () => void;
  notificationClick: (callback: (notificationId: string) => void) => void;
  getAppVersion: () => Promise<string>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

/**
 * 检查是否运行在 Electron 环境中。
 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI;
}

/**
 * 最小化到系统托盘。
 */
export function minimizeToTray(): void {
  window.electronAPI?.minimizeToTray();
}

/**
 * 注册通知点击回调。
 */
export function onNotificationClick(callback: (id: string) => void): void {
  window.electronAPI?.notificationClick(callback);
}

/**
 * 获取应用版本号。
 */
export async function getAppVersion(): Promise<string> {
  try {
    return await window.electronAPI?.getAppVersion() || '0.1.0';
  } catch {
    return '0.1.0';
  }
}
