/**
 * tests/init/agent-entry.test.ts — 进程装配组合根（D603 簇5）配对测试
 *
 * 契约（铁律 47）—— src/init/agent-entry.ts：
 *   @input  无（进程级装配）
 *   @output startSynovaAgentProcess: initEngineContext → new SynovaAgent(getDatabase()) →
 *           await start() → 返回 agent；stopSynovaAgentProcess: closeEngineContext 透传
 *   @degraded 引擎初始化/agent.start 失败 → 原样抛出（由入口 catch 退出，不静默）
 *
 * 覆盖矩阵（铁律 48）：[正常] 装配序列物理断言（初始化→db 注入→启动→返回）/
 * [边界] stop 透传 closeEngineContext / [降级] start 失败原样传播
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { calls, fakeDb, startSpy } = vi.hoisted(() => ({
  calls: [] as string[],
  fakeDb: { marker: 'engine-db' } as unknown as import('better-sqlite3').Database,
  startSpy: vi.fn(async () => { calls.push('agent.start'); }),
}));

vi.mock('../../src/init/engine-context', () => ({
  initEngineContext: vi.fn(() => { calls.push('initEngineContext'); }),
  getDatabase: vi.fn(() => fakeDb),
  closeEngineContext: vi.fn(() => { calls.push('closeEngineContext'); }),
}));

vi.mock('../../src/agent/synova-agent', () => ({
  SynovaAgent: vi.fn().mockImplementation(function (this: unknown, db: unknown) {
    calls.push(`new SynovaAgent(${db === fakeDb ? 'engine-db' : 'other'})`);
    return { start: startSpy };
  }),
}));

import { startSynovaAgentProcess, stopSynovaAgentProcess } from '../../src/init/agent-entry';
import { initEngineContext, closeEngineContext, getDatabase } from '../../src/init/engine-context';
import { SynovaAgent } from '../../src/agent/synova-agent';

beforeEach(() => {
  calls.length = 0;
  startSpy.mockClear();
  vi.mocked(initEngineContext).mockClear();
  vi.mocked(closeEngineContext).mockClear();
  vi.mocked(getDatabase).mockClear();
});

describe('agent-entry — 组合根装配序列（src/index.ts 前身语义）', () => {
  it('[正常] 装配序列：initEngineContext → SynovaAgent(engine-db) → start → 返回 agent', async () => {
    const agent = await startSynovaAgentProcess();

    expect(calls[0]).toBe('initEngineContext');
    expect(calls.some((c) => c === 'new SynovaAgent(engine-db)')).toBe(true);
    expect(calls).toContain('agent.start');
    // 返回值即被启动的 agent 实例（start 落定后返回）
    expect((agent as unknown as { start: unknown }).start).toBeTypeOf('function');
  });

  it('[边界] stopSynovaAgentProcess 透传 closeEngineContext（进程退出路径）', () => {
    stopSynovaAgentProcess();

    expect(closeEngineContext).toHaveBeenCalledTimes(1);
  });

  it('[降级] agent.start 失败 → 原样抛出（由入口 catch 退出，不静默不吞）', async () => {
    vi.mocked(SynovaAgent).mockImplementationOnce(function (this: unknown) {
      return { start: vi.fn(async () => { throw new Error('engine boom'); }) };
    });

    await expect(startSynovaAgentProcess()).rejects.toThrow('engine boom');
  });
});
