/**
 * tests/notifications/registry.test.ts
 * v3.6 Batch 1 — notification registry 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerNotificationAdapter,
  unregisterNotificationAdapter,
  listNotificationChannels,
  listActiveAdapters,
  dispatchNotification,
  clearNotificationRegistry,
} from '../../src/notifications/registry';
import type { NotificationAdapter, Notification, NotificationResult } from '../../src/notifications/types';

// Fake adapter for testing
function fakeAdapter(channel: string, shouldSucceed = true): NotificationAdapter {
  return {
    channel,
    shouldHandle(n: Notification) { return n.targetSystem === channel; },
    async send(_n: Notification): Promise<NotificationResult> {
      if (!shouldSucceed) throw new Error('simulated failure');
      return { success: true, externalId: `ext-${channel}-1` };
    },
  };
}

const testNotification: Notification = {
  id: 'notif-1',
  orgId: 'test-org',
  title: '测试通知',
  description: '测试描述',
  priority: 'P1',
  targetSystem: 'test-channel',
  createdAt: new Date().toISOString(),
};

describe('NotificationRegistry', () => {
  beforeEach(() => {
    clearNotificationRegistry();
  });

  it('注册后 listChannels 包含该 channel', () => {
    registerNotificationAdapter(fakeAdapter('test-channel'));
    expect(listNotificationChannels()).toContain('test-channel');
  });

  it('注销后 listChannels 不再包含', () => {
    registerNotificationAdapter(fakeAdapter('test-channel'));
    unregisterNotificationAdapter('test-channel');
    expect(listNotificationChannels()).not.toContain('test-channel');
  });

  it('listActiveAdapters 返回所有注册的适配器', () => {
    registerNotificationAdapter(fakeAdapter('a'));
    registerNotificationAdapter(fakeAdapter('b'));
    expect(listActiveAdapters().length).toBe(2);
  });

  it('dispatch notification 发送到匹配的适配器', async () => {
    registerNotificationAdapter(fakeAdapter('test-channel'));
    const { results, degraded } = await dispatchNotification(testNotification);
    expect(results.length).toBe(1);
    expect(results[0].result.success).toBe(true);
    expect(degraded).toBe(false);
  });

  it('无匹配适配器时 degraded', async () => {
    const { results, degraded } = await dispatchNotification({
      ...testNotification,
      targetSystem: 'nonexistent',
    });
    expect(results.length).toBe(0);
    expect(degraded).toBe(true);
  });

  it('适配器异常不阻塞其他适配器', async () => {
    registerNotificationAdapter(fakeAdapter('test-channel', false)); // fails
    registerNotificationAdapter(fakeAdapter('test-channel-2', true)); // succeeds
    const notif = { ...testNotification, targetSystem: 'test-channel' };
    // Only the first adapter matches test-channel
    const { degraded } = await dispatchNotification(notif);
    expect(degraded).toBe(true);
  });
});
