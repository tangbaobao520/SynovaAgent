/**
 * src/notifications/registry.ts — 通知适配器注册表
 *
 * 管理所有已注册的 NotificationAdapter 实例。
 * 通过 ExtensionLoader 从 extensions/notifications/ 目录自动发现和加载。
 * 事件驱动：订阅 orchestrator 的 action_created 事件 → 分发到匹配的适配器。
 *
 * v3.6 Batch 1 — 通知渠道文件化
 */
import { createLogger } from '@synova/logger';
import type { NotificationAdapter, Notification, NotificationResult } from './types';

const log = createLogger('notifications/registry');

// ═══ Singleton Registry ═══
const adapters = new Map<string, NotificationAdapter>();

/**
 * 注册通知适配器。
 */
export function registerNotificationAdapter(adapter: NotificationAdapter): void {
  if (adapters.has(adapter.channel)) {
    log.warn({ channel: adapter.channel }, '通知适配器重复注册 — 覆盖旧适配器');
  }
  adapters.set(adapter.channel, adapter);
  log.info({ channel: adapter.channel }, '通知适配器已注册');
}

/**
 * 注销通知适配器。
 */
export function unregisterNotificationAdapter(channel: string): void {
  adapters.delete(channel);
  log.info({ channel }, '通知适配器已注销');
}

/**
 * 列出所有已注册的通知渠道。
 */
export function listNotificationChannels(): string[] {
  return [...adapters.keys()];
}

/**
 * 列出所有活跃的通知适配器。
 */
export function listActiveAdapters(): NotificationAdapter[] {
  return [...adapters.values()];
}

/**
 * 向所有匹配的适配器发送通知。
 * 每个适配器通过 shouldHandle() 判断是否处理此通知。
 * 单个适配器失败不阻塞其他适配器。
 */
export async function dispatchNotification(notification: Notification): Promise<{
  results: Array<{ channel: string; result: NotificationResult }>;
  degraded: boolean;
}> {
  const results: Array<{ channel: string; result: NotificationResult }> = [];
  let degraded = false;

  const matching = [...adapters.values()].filter(a => a.shouldHandle(notification));

  if (matching.length === 0) {
    log.warn({ notificationId: notification.id, targetSystem: notification.targetSystem }, '无匹配的通知适配器 — degraded');
    degraded = true;
    return { results, degraded };
  }

  // 并行发送到所有匹配的适配器
  const sendResults = await Promise.allSettled(
    matching.map(async (adapter) => {
      try {
        const result = await adapter.send(notification);
        return { channel: adapter.channel, result };
      } catch (err: any) {
        log.warn({ err: err instanceof Error ? err.message : String(err) }, "消息发送失败");
        return {
          channel: adapter.channel,
          result: { success: false, error: err.message },
        };
      }
    })
  );

  for (const sr of sendResults) {
    if (sr.status === 'fulfilled') {
      results.push(sr.value);
      if (!sr.value.result.success) {
        log.warn({ channel: sr.value.channel, error: sr.value.result.error }, '通知发送失败');
        degraded = true;
      }
    } else {
      degraded = true;
      log.error({ reason: sr.reason }, '通知适配器异常');
    }
  }

  return { results, degraded };
}

/**
 * 清除所有注册的适配器（用于热加载）。
 */
export function clearNotificationRegistry(): void {
  adapters.clear();
  log.info('通知适配器注册表已清除');
}
