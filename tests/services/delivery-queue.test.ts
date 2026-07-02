/**
 * tests/services/delivery-queue.test.ts — Phase 2.1 投递队列服务测试
 *
 * 测试 DeliveryQueue.enqueue/drain 逻辑，mock 底层 store。
 *
 * 铁律 33: *.test.ts 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@synova/logger', () => {
  const m = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
  return { logger: m, createLogger: vi.fn(() => m) };
});

// Mock store
function createMockStore() {
  const entries: any[] = [];
  let seq = 0;
  return {
    enqueue: vi.fn((e: any) => {
      const id = `q_${++seq}`;
      entries.push({ ...e, id, status: 'pending', retryCount: 0 });
      return entries[entries.length - 1];
    }),
    dequeue: vi.fn(() => {
      const idx = entries.findIndex((e: any) => e.status === 'pending');
      return idx >= 0 ? entries[idx] : null;
    }),
    markDelivered: vi.fn((id: string) => {
      const e = entries.find((x: any) => x.id === id);
      if (e) e.status = 'delivered';
    }),
    markFailed: vi.fn((id: string) => {
      const e = entries.find((x: any) => x.id === id);
      if (e) e.retryCount = (e.retryCount || 0) + 1;
      if (e.retryCount >= 5) e.status = 'failed';
    }),
    peekPending: vi.fn(() => entries.filter((e: any) => e.status === 'pending')),
  };
}

import { DeliveryQueue } from '../../src/services/delivery-queue';

describe('DeliveryQueue — enqueue', () => {
  it('enqueue 应委托给 store', () => {
    const store = createMockStore();
    const q = new DeliveryQueue(store as any);

    q.enqueue({ orgId: 'org1', targetType: 'notification', targetId: 'u1', payload: '{}' });

    expect(store.enqueue).toHaveBeenCalledTimes(1);
  });
});

describe('DeliveryQueue — drain', () => {
  it('无 pending 条目时 drain 应快速完成', async () => {
    const store = createMockStore();
    const q = new DeliveryQueue(store as any);

    const result = await q.drain();
    expect(result.delivered).toBe(0);
  });

  it('drain 应处理所有 pending 条目', async () => {
    const store = createMockStore();
    store.enqueue({ orgId: 'org1', targetType: 'message', targetId: 's1', payload: '{}' });
    store.enqueue({ orgId: 'org1', targetType: 'alert', targetId: 's2', payload: '{}' });
    const q = new DeliveryQueue(store as any);

    const result = await q.drain();

    expect(result.delivered).toBe(2);
  });

  it('drain 应调用 store.markDelivered', async () => {
    const store = createMockStore();
    store.enqueue({ orgId: 'org1', targetType: 'notification', targetId: 'u1', payload: '{}' });
    const q = new DeliveryQueue(store as any);

    await q.drain();

    expect(store.markDelivered).toHaveBeenCalled();
  });

  it('单个条目投递失败应继续处理其余条目', async () => {
    const store = createMockStore();
    store.enqueue({ orgId: 'org1', targetType: 'message', targetId: 's1', payload: '{}' });
    store.enqueue({ orgId: 'org1', targetType: 'alert', targetId: 's2', payload: '{}' });
    // 让 markDelivered 第一次抛异常
    store.markDelivered = vi.fn().mockImplementationOnce(() => { throw new Error('delivery failed'); })
      .mockImplementationOnce(() => {});
    const q = new DeliveryQueue(store as any);

    const result = await q.drain();

    expect(result.delivered).toBe(1);
    expect(result.degraded).toBe(true);
  });

  // 超时保护已通过代码结构验证: Date.now() - startTime >= maxTimeMs → break
  // 逻辑简单，不适合在同步 mock 上做 timing 测试（毫秒级不可靠）
});
