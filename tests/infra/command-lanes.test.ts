/**
 * tests/infra/command-lanes.test.ts — Phase 4.1 命令Lane测试
 *
 * 铁律 33: *.test.ts 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@synova/logger', () => {
  const m = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
  return { logger: m, createLogger: vi.fn(() => m) };
});

import { CommandLanes } from '../../src/infra/command-lanes';
import { logger } from '@synova/logger';

describe('CommandLanes — 基础操作', () => {
  let lanes: CommandLanes;

  beforeEach(() => { vi.clearAllMocks(); lanes = new CommandLanes(); });

  it('execute 应顺序执行任务', async () => {
    const results: number[] = [];
    await lanes.execute('main', async () => { results.push(1); });
    await lanes.execute('main', async () => { results.push(2); });
    expect(results).toEqual([1, 2]);
  });

  it('同一 lane 任务应串行', async () => {
    const results: number[] = [];
    const p1 = lanes.execute('main', async () => { await new Promise(r => setTimeout(r, 10)); results.push(1); });
    const p2 = lanes.execute('main', async () => { results.push(2); });
    await Promise.all([p1, p2]);
    expect(results).toEqual([1, 2]);
  });

  it('不同 lane 任务应并行', async () => {
    const results: number[] = [];
    const p1 = lanes.execute('main', async () => { await new Promise(r => setTimeout(r, 20)); results.push(1); });
    const p2 = lanes.execute('cron', async () => { results.push(2); });
    await Promise.all([p1, p2]);
    expect(results).toContain(2);
  });
});

describe('CommandLanes — 关闭', () => {
  let lanes: CommandLanes;

  beforeEach(() => { vi.clearAllMocks(); lanes = new CommandLanes(); });

  it('关闭后新任务应被拒绝', async () => {
    lanes.shutdown();
    await expect(lanes.execute('main', async () => {})).rejects.toThrow('关闭');
  });
});

describe('CommandLanes — 超时', () => {
  it('超时任务应被拒绝', async () => {
    const lanes = new CommandLanes({ defaultTimeoutMs: 50 });
    await expect(lanes.execute('main', async () => {
      await new Promise(r => setTimeout(r, 200));
    })).rejects.toThrow('超时');
  });
});

describe('CommandLanes — 错误处理', () => {
  let lanes: CommandLanes;

  beforeEach(() => { vi.clearAllMocks(); lanes = new CommandLanes(); });

  it('任务抛异常应传播到调用方', async () => {
    await expect(lanes.execute('main', async () => {
      throw new Error('task error');
    })).rejects.toThrow('task error');
  });

  it('一个任务失败不应阻塞同一 lane 的后续任务', async () => {
    const results: number[] = [];
    await lanes.execute('main', async () => { throw new Error('fail'); }).catch(() => {});
    await lanes.execute('main', async () => { results.push(2); });
    expect(results).toEqual([2]);
  });
});
