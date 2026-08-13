/**
 * tests/loops/middle-evolution-engine.test.ts — D92 中层驱动进化引擎
 *
 * 覆盖: 5信号类型 + 2仲裁 + 2 GA缺席 + 1降级 = ≥10
 */
import { describe, it, expect } from 'vitest';
import { processFeedbackSignals, computeGAProtection, type EvolutionAction, type AggregatedSignal } from '../../src/loops/middle-evolution-engine';

function makeSignal(overrides: Partial<AggregatedSignal> = {}): AggregatedSignal {
  return { key: 'test', decision: 'reject', targetType: 'sentinel_alert', count: 3, latestTimestamp: new Date().toISOString(), targetIds: ['t1'], ...overrides };
}

describe('D92 — processFeedbackSignals 5信号', () => {
  it('阈值调整: reject×sentinel_alert≥3', () => {
    const actions = processFeedbackSignals([
      makeSignal({ key: 'sentinel-cpu', decision: 'reject', targetType: 'sentinel_alert', count: 3 }),
    ]);
    expect(actions.some(a => a.type === 'threshold_adjust')).toBe(true);
  });

  it('Goal目标调整: modify×goal≥3', () => {
    const actions = processFeedbackSignals([
      makeSignal({ key: 'goal-revenue', decision: 'modify', targetType: 'goal', count: 3 }),
    ]);
    expect(actions.some(a => a.type === 'goal_formula_tweak')).toBe(true);
  });

  it('路径降级: reject_path≥3', () => {
    const actions = processFeedbackSignals([
      makeSignal({ key: 'path-aggressive', decision: 'reject_path', targetType: 'proposal', count: 3 }),
    ]);
    expect(actions.some(a => a.type === 'path_rank_downgrade')).toBe(true);
  });

  it('专家降级: ineffective≥3', () => {
    const actions = processFeedbackSignals([
      makeSignal({ key: 'expert-finance', decision: 'ineffective', targetType: 'goal', count: 3 }),
    ]);
    expect(actions.some(a => a.type === 'expert_confidence_downgrade')).toBe(true);
  });

  it('跨部门矛盾检测', () => {
    const actions = processFeedbackSignals([
      makeSignal({ key: 'finance', decision: 'reject', targetType: 'sentinel_alert', targetIds: ['t1'], count: 5 }),
      makeSignal({ key: 'marketing', decision: 'modify', targetType: 'sentinel_alert', targetIds: ['t1'], count: 3 }),
    ]);
    expect(actions.some(a => a.type === 'cross_dept_arbitration')).toBe(true);
  });

  it('次数不足3不触发', () => {
    const actions = processFeedbackSignals([
      makeSignal({ key: 'sentinel-cpu', decision: 'reject', targetType: 'sentinel_alert', count: 2 }),
    ]);
    expect(actions.some(a => a.type === 'threshold_adjust')).toBe(false);
  });

  it('空信号 → 返回空', () => {
    expect(processFeedbackSignals([])).toHaveLength(0);
  });

  it('undefined → 返回空（降级）', () => {
    expect(processFeedbackSignals(undefined as unknown as AggregatedSignal[])).toHaveLength(0);
  });
});

describe('D92 — GA缺席保护', () => {
  it('高活动率→低阈值', () => {
    const r = computeGAProtection(60, 0.8);
    expect(r.autoUpgradeThreshold).toBe(12); // 60 * (1-0.8) = 12
    expect(r.shouldUpgrade).toBe(true); // 60 >= 12
  });

  it('低活动率→高阈值', () => {
    const r = computeGAProtection(30, 0.3);
    expect(r.autoUpgradeThreshold).toBe(42); // 60 * (1-0.3) = 42
    expect(r.shouldUpgrade).toBe(false); // 30 < 42
  });

  it('活动率边界: 0和1', () => {
    const r1 = computeGAProtection(60, 0);
    expect(r1.autoUpgradeThreshold).toBe(60);
    const r2 = computeGAProtection(0, 1);
    expect(r2.autoUpgradeThreshold).toBe(0);
    expect(r2.shouldUpgrade).toBe(true); // absent=0 ≥ threshold=0
  });
});

describe('D92 — 返回结构验证', () => {
  it('每个EvolutionAction含全部字段', () => {
    const actions = processFeedbackSignals([
      makeSignal({ key: 's1', decision: 'reject', targetType: 'sentinel_alert', count: 5 }),
    ]);
    expect(actions.length).toBeGreaterThan(0);
    const a = actions[0];
    expect(a.type).toBeDefined();
    expect(a.reason).toBeDefined();
    expect(a.parameter).toBeDefined();
    expect(typeof a.confidence).toBe('number');
    expect(a.triggeredAt).toBeDefined();
  });

  it('GAProtectionResult含全部字段', () => {
    const r = computeGAProtection(30, 0.5);
    expect(typeof r.autoUpgradeThreshold).toBe('number');
    expect(typeof r.shouldUpgrade).toBe('boolean');
    expect(typeof r.gaAbsenceDays).toBe('number');
    expect(typeof r.middleActivityRate).toBe('number');
  });
});
