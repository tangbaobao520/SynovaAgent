/**
 * tests/services/memory-monitor.test.ts — Phase 5.3 内存监控测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@synova/logger', () => {
  const m = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
  return { logger: m, createLogger: vi.fn(() => m) };
});

import { MemoryMonitor } from '../../src/services/memory-monitor';
import { logger } from '@synova/logger';

describe('MemoryMonitor', () => {
  let monitor: MemoryMonitor;

  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { monitor?.stop(); });

  it('start 应记录基线', () => {
    monitor = new MemoryMonitor();
    monitor.start();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ rss: expect.any(Number) }),
      expect.stringContaining('[MEMORY]'),
    );
  });

  it('stop 应记录最终快照', () => {
    monitor = new MemoryMonitor();
    monitor.start();
    vi.clearAllMocks();
    monitor.stop();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ rss: expect.any(Number) }),
      expect.stringContaining('最终'),
    );
  });

  it('process.memoryUsage 不可用时应 WARNING', () => {
    const original = process.memoryUsage;
    (process as any).memoryUsage = undefined;
    monitor = new MemoryMonitor();
    monitor.start();
    expect(logger.warn).toHaveBeenCalled();
    (process as any).memoryUsage = original;
  });

  it('start 不应重复启动', () => {
    monitor = new MemoryMonitor();
    monitor.start();
    vi.clearAllMocks();
    monitor.start();
    // 第二次 start 不应记录基线
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('getStats 应返回内存统计', () => {
    monitor = new MemoryMonitor();
    monitor.start();
    const stats = monitor.getStats();
    expect(stats).toHaveProperty('rss');
    expect(stats).toHaveProperty('heapUsed');
    expect(stats).toHaveProperty('heapTotal');
  });
});
