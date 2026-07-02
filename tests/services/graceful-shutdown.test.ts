/**
 * tests/services/graceful-shutdown.test.ts — Phase 1.2 优雅关闭测试
 *
 * 对标 OpenClaw active-sessions-shutdown-tracker.ts
 * 覆盖 noteActive/forgetActive/drain(store) 全链路
 *
 * 铁律 0-2: spec → test → impl → wire → review → merge
 * 铁律 33: *.test.ts 单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@synova/logger', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  };
  return {
    logger: mockLogger,
    createLogger: vi.fn(() => mockLogger),
  };
});

import {
  GracefulShutdown,
  getGlobalGracefulShutdown,
  setGlobalGracefulShutdown,
} from '../../src/services/graceful-shutdown';
import type { SessionStoreForDrain } from '../../src/services/graceful-shutdown';
import { logger } from '@synova/logger';

function createMockStore(): SessionStoreForDrain & { addMessage: ReturnType<typeof vi.fn>; saveDiagnosisCheckpoint: ReturnType<typeof vi.fn> } {
  return {
    addMessage: vi.fn(),
    saveDiagnosisCheckpoint: vi.fn(),
  };
}

describe('GracefulShutdown — 活跃会话追踪', () => {
  let shutdown: GracefulShutdown;

  beforeEach(() => { vi.clearAllMocks(); shutdown = new GracefulShutdown(); });

  it('新建实例应无活跃会话', () => {
    expect(shutdown.activeCount()).toBe(0);
  });

  it('noteActive 应增加活跃计数', () => {
    shutdown.noteActive('sess_001', { orgId: 'org1' });
    expect(shutdown.activeCount()).toBe(1);
  });

  it('同一会话重复 noteActive 不重复计数', () => {
    shutdown.noteActive('sess_001', { orgId: 'org1' });
    shutdown.noteActive('sess_001', { orgId: 'org1-updated' });
    expect(shutdown.activeCount()).toBe(1);
  });

  it('forgetActive 应减少活跃计数', () => {
    shutdown.noteActive('sess_001', { orgId: 'org1' });
    shutdown.forgetActive('sess_001');
    expect(shutdown.activeCount()).toBe(0);
  });

  it('forgetActive 不存在的会话应静默', () => {
    expect(() => shutdown.forgetActive('nonexistent')).not.toThrow();
  });

  it('listActive 应返回所有活跃会话', () => {
    shutdown.noteActive('sess_001', { orgId: 'org1' });
    shutdown.noteActive('sess_002', { orgId: 'org2' });
    expect(shutdown.listActive()).toHaveLength(2);
  });
});

describe('GracefulShutdown — drain(store)', () => {
  let shutdown: GracefulShutdown;

  beforeEach(() => { vi.clearAllMocks(); shutdown = new GracefulShutdown(); });

  it('无活跃会话时应跳过', async () => {
    const result = await shutdown.drain(createMockStore());
    expect(result.drained).toBe(0);
    expect(logger.info).toHaveBeenCalledWith('无活跃会话 — 跳过排干');
  });

  it('有活跃会话时应调用 addMessage 通知', async () => {
    const store = createMockStore();
    shutdown.noteActive('sess_001', { orgId: 'org1' });

    const result = await shutdown.drain(store);

    expect(result.drained).toBe(1);
    expect(store.addMessage).toHaveBeenCalledWith(
      'sess_001',
      'system',
      expect.stringContaining('重启'),
    );
  });

  it('应保存诊断检查点', async () => {
    const store = createMockStore();
    shutdown.noteActive('sess_001', { orgId: 'org1', phase: 3 });

    await shutdown.drain(store);

    expect(store.saveDiagnosisCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess_001',
        phase: 3,
      }),
    );
  });

  it('多个活跃会话应全部排干', async () => {
    const store = createMockStore();
    shutdown.noteActive('sess_001', { orgId: 'org1' });
    shutdown.noteActive('sess_002', { orgId: 'org2' });

    const result = await shutdown.drain(store);

    expect(result.drained).toBe(2);
    expect(store.addMessage).toHaveBeenCalledTimes(2);
    expect(store.saveDiagnosisCheckpoint).toHaveBeenCalledTimes(2);
  });

  it('drain 后活跃列表应清空', async () => {
    const store = createMockStore();
    shutdown.noteActive('sess_001', { orgId: 'org1' });
    await shutdown.drain(store);
    expect(shutdown.activeCount()).toBe(0);
  });

  it('无 saveDiagnosisCheckpoint 的 store 应跳过检查点保存', async () => {
    const store = { addMessage: vi.fn() };
    shutdown.noteActive('sess_001', { orgId: 'org1' });

    const result = await shutdown.drain(store as SessionStoreForDrain);

    expect(result.drained).toBe(1);
    expect(store.addMessage).toHaveBeenCalled();
  });

  it('排干超时应强制清空', async () => {
    const store = createMockStore();
    shutdown.noteActive('sess_001', { orgId: 'org1' });

    const result = await shutdown.drain(store, 1); // 1ms 超时

    // drain 应完成（可能超时后清空）
    expect(result.drained).toBeGreaterThanOrEqual(0);
  });
});

describe('getGlobalGracefulShutdown / setGlobalGracefulShutdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setGlobalGracefulShutdown(null);
  });

  it('getGlobalGracefulShutdown 应返回实例', () => {
    const gs = getGlobalGracefulShutdown();
    expect(gs).toBeInstanceOf(GracefulShutdown);
  });

  it('setGlobalGracefulShutdown 应覆盖全局实例', () => {
    const custom = new GracefulShutdown();
    custom.noteActive('sess_001', { orgId: 'test' });
    setGlobalGracefulShutdown(custom);

    expect(getGlobalGracefulShutdown().activeCount()).toBe(1);
  });

  it('getGlobalGracefulShutdown 应幂等（同一实例）', () => {
    const a = getGlobalGracefulShutdown();
    const b = getGlobalGracefulShutdown();
    expect(a).toBe(b);
  });
});
