/**
 * tests/services/graceful-shutdown.test.ts — Phase 1.2 优雅关闭测试
 *
 * 对标 OpenClaw active-sessions-shutdown-tracker.ts:
 *   - Map<string, SessionEntry> 追踪活跃会话
 *   - noteActive / forgetActive / listActive 模式
 *
 * 铁律 0-2: spec → test → impl → wire → review → merge
 * 铁律 33: *.test.ts 单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock logger ──
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

import { GracefulShutdown } from '../../src/services/graceful-shutdown';
import { logger } from '@synova/logger';

describe('GracefulShutdown — 活跃会话追踪', () => {
  let shutdown: GracefulShutdown;

  beforeEach(() => {
    vi.clearAllMocks();
    shutdown = new GracefulShutdown();
  });

  it('新建实例应无活跃会话', () => {
    expect(shutdown.activeCount()).toBe(0);
  });

  it('noteActive 应增加活跃计数', () => {
    shutdown.noteActive('sess_001', { orgId: 'org1' });
    expect(shutdown.activeCount()).toBe(1);
  });

  it('多个 noteActive 应累计计数', () => {
    shutdown.noteActive('sess_001', { orgId: 'org1' });
    shutdown.noteActive('sess_002', { orgId: 'org2' });
    expect(shutdown.activeCount()).toBe(2);
  });

  it('重复 noteActive 同一会话不应重复计数', () => {
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
    const list = shutdown.listActive();
    expect(list).toHaveLength(2);
    expect(list.map(e => e.sessionId)).toContain('sess_001');
    expect(list.map(e => e.sessionId)).toContain('sess_002');
  });
});

describe('GracefulShutdown — drain', () => {
  let shutdown: GracefulShutdown;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    shutdown = new GracefulShutdown();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('无活跃会话时 drain 应快速完成', async () => {
    await shutdown.drain();
    // pino: info(msg) 单参数
    expect(logger.info).toHaveBeenCalledWith('无活跃会话 — 跳过排干');
  });

  it('有活跃会话时 drain 应记录排干日志', async () => {
    shutdown.noteActive('sess_001', { orgId: 'org1' });
    shutdown.noteActive('sess_002', { orgId: 'org2' });

    await shutdown.drain();

    // pino: info(obj, msg) 双参数
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ count: 2 }),
      expect.stringContaining('排干'),
    );
  });

  it('drain 后所有会话应标记为已排干', async () => {
    shutdown.noteActive('sess_001', { orgId: 'org1' });
    await shutdown.drain();
    expect(shutdown.activeCount()).toBe(0);
  });

  it('drain 应接受自定义超时参数', async () => {
    const customTimeout = 5000;
    // 只需验证不抛异常
    await expect(shutdown.drain(customTimeout)).resolves.not.toThrow();
  });
});
