/**
 * notifications/electron-adapter.ts — Electron 通知适配器 (Phase 4.1)
 *
 * 实现 NotificationAdapter 接口。
 * Express 后端通过 dispatchNotification 发送通知到 Electron 渲染进程。
 * 实际系统通知弹出由 electron-main.ts 的 showSystemNotification 处理。
 */
import { createLogger } from '@synova/logger';
import type { Notification, NotificationResult, NotificationAdapter } from './types';

const log = createLogger('notifications/electron-adapter');

export class ElectronNotificationAdapter implements NotificationAdapter {
  readonly channel = 'electron';

  shouldHandle(notification: Notification): boolean {
    return notification.priority === 'P0';
  }

  async send(notification: Notification): Promise<NotificationResult> {
    try {
      log.info({
        notificationId: notification.id,
        title: notification.title,
        priority: notification.priority,
      }, 'Electron 通知已分发');
      return { success: true, externalId: notification.id };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, 'Electron 通知失败 — degraded');
      return { success: false, error: msg };
    }
  }
}
