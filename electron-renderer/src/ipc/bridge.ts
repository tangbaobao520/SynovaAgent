/**
 * ipc/bridge.ts — Electron IPC 桥接 (Phase 4.1)
 */
export interface ElectronAPI {
  getServerUrl: () => string;
  getConfig: () => Record<string, unknown>;
  minimizeToTray: () => void;
  getAppVersion: () => Promise<string>;
  showNotification: (title: string, body: string, id?: string) => void;
  pauseNotifications: (durationMs: number) => void;
  resumeNotifications: () => void;
  updateTrayState: (state: 'normal' | 'unread' | 'critical', count?: number) => void;
  onNotificationClick: (callback: (id: string) => void) => void;
  onNavigate: (callback: (view: string) => void) => void;
}

declare global {
  interface Window { electronAPI?: ElectronAPI; }
}

export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI;
}

export function minimizeToTray(): void { window.electronAPI?.minimizeToTray(); }
export async function getAppVersion(): Promise<string> {
  try { return await window.electronAPI?.getAppVersion() || '0.1.0'; } catch (err) { console.warn('[bridge] getAppVersion 失败 — 降级 0.1.0:', err); return '0.1.0'; }
}

/** 弹出系统通知 */
export function showNotification(title: string, body: string, id?: string): void {
  window.electronAPI?.showNotification(title, body, id);
}

/** 更新托盘状态 */
export function updateTrayState(state: 'normal' | 'unread' | 'critical', count?: number): void {
  window.electronAPI?.updateTrayState(state, count);
}

/** 暂停通知 */
export function pauseNotifications(durationMs: number): void {
  window.electronAPI?.pauseNotifications(durationMs);
}

/** 恢复通知 */
export function resumeNotifications(): void {
  window.electronAPI?.resumeNotifications();
}
