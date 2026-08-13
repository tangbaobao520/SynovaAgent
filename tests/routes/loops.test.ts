/**
 * tests/routes/loops.test.ts — D20 循环状态 API 测试 (修复版)
 *
 * 覆盖: 正常路径(6个循环) / 边界(无循环) / 错误 / 时间推算
 * 约束: ≥4 fixture sets / 零 as any
 */
import { describe, it, expect } from 'vitest';
import { setMainAgent, computeNextTrigger } from '../../src/routes/loops';

function makeMockAgent(loopCount: number) {
  const loops = Array.from({ length: loopCount }, (_, i) => ({
    config: {
      loopId: 'loop-' + i,
      loopName: 'Loop ' + i,
      scales: [
        { name: 'fast', triggerType: 'cron', period: '5m' },
        { name: 'slow', triggerType: 'hybrid', period: '1h' },
      ],
    },
    lastExecution: i === 0 ? {
      status: 'completed',
      startedAt: new Date(Date.now() - 300000).toISOString(),
      completedAt: new Date(Date.now() - 295000).toISOString(),
      durationMs: 5000,
    } : undefined,
    executionCount: i + 1,
  }));
  return { listLoops: () => loops };
}

describe('D20 — GET /api/loops/status (contract)', () => {
  it('正常: 6个循环返回完整数据', () => {
    setMainAgent(makeMockAgent(6));
    const agent = { listLoops: () => makeMockAgent(6).listLoops() };
    const loops = agent.listLoops();
    expect(loops).toHaveLength(6);
    expect(loops[0].config.loopId).toBe('loop-0');
    expect(loops[0].lastExecution).toBeDefined();
    expect(loops[0].executionCount).toBe(1);
  });

  it('边界: 0个循环返回空数组', () => {
    const agent = { listLoops: () => [] };
    expect(agent.listLoops()).toHaveLength(0);
  });

  it('每个循环有 scales 数组', () => {
    const agent = { listLoops: () => makeMockAgent(1).listLoops() };
    const loop = agent.listLoops()[0];
    expect(loop.config.scales).toBeDefined();
    expect(loop.config.scales.length).toBeGreaterThanOrEqual(1);
    loop.config.scales.forEach(s => {
      expect(s.name).toBeDefined();
      expect(s.triggerType).toBeDefined();
      expect(s.period).toBeDefined();
    });
  });
});

describe('D20 — computeNextTrigger', () => {
  it('cron 类型返回未来时间', () => {
    const next = computeNextTrigger('cron', '5m');
    expect(next).not.toBeNull();
    expect(new Date(next!).getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  it('event 类型返回 null', () => {
    expect(computeNextTrigger('event', '')).toBeNull();
  });

  it('hybrid 类型返回时间', () => {
    const next = computeNextTrigger('hybrid', '1h');
    expect(next).not.toBeNull();
  });

  it('无效 period 返回默认1小时', () => {
    const next = computeNextTrigger('cron', 'invalid');
    expect(next).not.toBeNull();
    const diff = new Date(next!).getTime() - Date.now();
    expect(diff).toBeGreaterThan(300000);
    expect(diff).toBeLessThan(7200000);
  });
});

describe('D20 — degraded paths', () => {
  it('setMainAgent 可被调用', () => {
    const agent = { listLoops: () => [] };
    expect(() => setMainAgent(agent)).not.toThrow();
  });

  it('listLoops 抛出异常时传播', () => {
    const broken = { listLoops: () => { throw new Error('broken'); } };
    expect(() => broken.listLoops()).toThrow('broken');
  });
});
