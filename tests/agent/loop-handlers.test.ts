/**
 * tests/agent/loop-handlers.test.ts — D333 进化循环真实化 (N13 接线)
 *
 * 覆盖: 正常信号→真实动作计数 / 无信号→degraded / collector 不可用→degraded
 *       边界: 零动作 / 回写错误 / 全部 pending / MainAgent 集成 (degraded + completed)
 *
 * red 基准 (修复前): defaultEvolutionHandler 恒 success:true、零引擎调用、无真实计数；
 *   MainAgent.executeLoop('loop-3') 恒 status=completed（伪造审计记录）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LoopTriggerConfig } from '../../src/loops/loop-trigger-config';

const mocks = vi.hoisted(() => ({
  getAggregatedSignals: vi.fn(),
  processFeedbackSignals: vi.fn(),
  applyEvolutionActions: vi.fn(),
}));

vi.mock('../../src/growth/feedback-collector', () => ({
  getFeedbackCollector: () => ({ getAggregatedSignals: mocks.getAggregatedSignals }),
}));

vi.mock('../../src/loops/middle-evolution-engine', () => ({
  processFeedbackSignals: mocks.processFeedbackSignals,
  applyEvolutionActions: mocks.applyEvolutionActions,
}));

import { defaultEvolutionHandler } from '../../src/agent/loop-handlers';
import { MainAgent } from '../../src/agent/main-agent';

/** 最小聚合信号 (D93 AggregatedSignal 形状) */
function makeSignal(overrides: Partial<{ key: string; decision: string; targetType: string; count: number }> = {}) {
  return {
    key: 'reject:sentinel_alert:',
    decision: 'reject',
    targetType: 'sentinel_alert',
    count: 3,
    latestTimestamp: '2026-08-17T00:00:00.000Z',
    targetIds: ['s1'],
    ...overrides,
  };
}

/** 最小循环配置 (同 main-agent.test.ts 惯例) */
function makeLoopConfig(overrides?: Partial<LoopTriggerConfig>): LoopTriggerConfig {
  return {
    loopId: 'loop-3',
    loopName: 'GA Evolution',
    scales: [
      { name: 'fast', period: '0 9 * * 1', triggerType: 'cron', coverage: 'test', condition: 'test' },
    ],
    ...overrides,
  };
}

/** 最小进化动作 (D92 EvolutionAction 形状) */
function makeAction() {
  return {
    type: 'threshold_adjust',
    reason: '哨兵 s1 被标注为 false alarm 3 次',
    parameter: { sentinelKey: 's1' },
    confidence: 0.3,
    triggeredAt: '2026-08-17T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.applyEvolutionActions.mockReturnValue({ applied: 0, skipped: 0, errors: [] });
});

describe('D333 — defaultEvolutionHandler 真实化 (N13 接线)', () => {
  it('有聚合信号 → 调用引擎两函数 + 返回真实计数', async () => {
    const signal = makeSignal();
    mocks.getAggregatedSignals.mockReturnValue([signal]);
    mocks.processFeedbackSignals.mockReturnValue([makeAction()]);
    mocks.applyEvolutionActions.mockReturnValue({ applied: 1, skipped: 0, errors: [] });

    const result = await defaultEvolutionHandler('fast');

    expect(result.success).toBe(true);
    expect(result.degraded).toBe(false);
    expect(result.output).toContain('聚合信号 1 条');
    expect(result.output).toContain('applied=1');
    expect(mocks.getAggregatedSignals).toHaveBeenCalledTimes(1);
    expect(mocks.processFeedbackSignals).toHaveBeenCalledTimes(1);
    expect(mocks.applyEvolutionActions).toHaveBeenCalledTimes(1);
  });

  it('无聚合信号 → degraded:true + 不调用引擎', async () => {
    mocks.getAggregatedSignals.mockReturnValue([]);

    const result = await defaultEvolutionHandler('fast');

    expect(result.success).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.output).toContain('无聚合信号');
    expect(mocks.processFeedbackSignals).not.toHaveBeenCalled();
    expect(mocks.applyEvolutionActions).not.toHaveBeenCalled();
  });

  it('collector 不可用 (抛异常) → degraded:true + error', async () => {
    mocks.getAggregatedSignals.mockImplementation(() => {
      throw new Error('db unavailable');
    });

    const result = await defaultEvolutionHandler('fast');

    expect(result.success).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.error).toContain('db unavailable');
  });

  it('有信号但零进化动作 → degraded:true + 不调用回写', async () => {
    mocks.getAggregatedSignals.mockReturnValue([makeSignal({ count: 2 })]);
    mocks.processFeedbackSignals.mockReturnValue([]);

    const result = await defaultEvolutionHandler('fast');

    expect(result.success).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.output).toContain('未达触发阈值');
    expect(mocks.applyEvolutionActions).not.toHaveBeenCalled();
  });

  it('回写部分失败 (errors>0) → degraded:true + error + 计数', async () => {
    const signal = makeSignal();
    mocks.getAggregatedSignals.mockReturnValue([signal]);
    mocks.processFeedbackSignals.mockReturnValue([makeAction()]);
    mocks.applyEvolutionActions.mockReturnValue({ applied: 0, skipped: 1, errors: ['thresholds.json 写入失败'] });

    const result = await defaultEvolutionHandler('fast');

    expect(result.success).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.error).toContain('thresholds.json 写入失败');
    expect(result.output).toContain('applied=0');
  });

  it('回写全部 pending (applied=0, errors=0) → degraded:true', async () => {
    const signal = makeSignal();
    mocks.getAggregatedSignals.mockReturnValue([signal]);
    mocks.processFeedbackSignals.mockReturnValue([makeAction()]);
    mocks.applyEvolutionActions.mockReturnValue({ applied: 0, skipped: 1, errors: [] });

    const result = await defaultEvolutionHandler('fast');

    expect(result.success).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.output).toContain('pending');
  });
});

describe('D333 — MainAgent 集成 (loop-3 生产路由)', () => {
  it('无信号 → status=degraded (不再伪造 completed)', async () => {
    mocks.getAggregatedSignals.mockReturnValue([]);
    const agent = new MainAgent();
    agent.registerLoop(makeLoopConfig());

    const record = await agent.executeLoop('loop-3');

    expect(record.status).toBe('degraded');
    expect(record.degraded).toBe(true);
  });

  it('有信号 + 真实回写 → status=completed + 真实计数', async () => {
    const signal = makeSignal();
    mocks.getAggregatedSignals.mockReturnValue([signal]);
    mocks.processFeedbackSignals.mockReturnValue([makeAction()]);
    mocks.applyEvolutionActions.mockReturnValue({ applied: 1, skipped: 0, errors: [] });
    const agent = new MainAgent();
    agent.registerLoop(makeLoopConfig());

    const record = await agent.executeLoop('loop-3');

    expect(record.status).toBe('completed');
    expect(record.degraded).toBe(false);
    expect(record.output).toContain('applied=1');
  });
});
