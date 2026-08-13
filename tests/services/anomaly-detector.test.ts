/**
 * tests/services/anomaly-detector.test.ts — D243 防破坏机制
 */
import { describe, it, expect } from 'vitest';
import { calculateBaseline, AnomalyDetector, SabotageHandler } from '../../src/services/anomaly-detector';
import { checkRateLimit, clearRateStore } from '../../src/middleware/rate-limiter';

describe('D243 — BaselineCalculator', () => {
  it('30天数据 → 计算 mean + stddev', () => {
    const data = Array.from({ length: 30 }, () => 10);
    const baseline = calculateBaseline(data);
    expect(baseline.mean).toBe(10);
    expect(baseline.stddev).toBe(0);
    expect(baseline.sampleCount).toBe(30);
  });

  it('空数据 → 返回 0', () => {
    expect(calculateBaseline([]).mean).toBe(0);
  });
});

describe('D243 — AnomalyDetector', () => {
  const detector = new AnomalyDetector();
  const baseline = { mean: 10, stddev: 2, sampleCount: 30 };

  it('Action 3x阈值触发 critical + suggestFreeze', () => {
    const r = detector.check('action_create', 35, baseline);
    expect(r.anomaly).toBe(true);
    expect(r.severity).toBe('critical');
    expect(r.suggestFreeze).toBe(true);
  });

  it('Goal 4x阈值触发 critical + suggestFreeze', () => {
    const r = detector.check('goal_change', 45, baseline);
    expect(r.anomaly).toBe(true);
    expect(r.suggestFreeze).toBe(true);
  });

  it('正常值 → 无异常', () => {
    const r = detector.check('action_create', 8, baseline);
    expect(r.anomaly).toBe(false);
  });

  it('无基线 → 不触发', () => {
    const r = detector.check('action_create', 100, { mean: 0, stddev: 0, sampleCount: 0 });
    expect(r.anomaly).toBe(false);
  });
});

describe('D243 — SabotageHandler', () => {
  it('freezeUser 更新状态 + 记录告警', () => {
    let updated = false;
    const store = { updateUser: () => { updated = true; }, getById: () => null };
    const handler = new SabotageHandler(store);
    handler.freezeUser('user-1', 'Action 3x threshold');
    expect(updated).toBe(true);
    expect(handler.getAlerts()).toHaveLength(1);
  });
});

describe('D243 — RateLimiter', () => {
  beforeEach(() => clearRateStore());

  it('正常次数 → 不阻断', () => {
    const r = checkRateLimit('user-1', 'data_export', 5);
    expect(r.blocked).toBe(false);
  });

  it('超限 → 阻断', () => {
    for (let i = 0; i < 6; i++) checkRateLimit('user-1', 'data_export', 5);
    const r = checkRateLimit('user-1', 'data_export', 5);
    expect(r.blocked).toBe(true);
    expect(r.count).toBe(7);
  });
});
