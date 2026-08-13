import { describe, it, expect } from 'vitest';
import { computeIncentiveAlignment } from '../../extensions/sentinels/incentive-alignment/computes/compute-incentive-alignment';

describe('computeIncentiveAlignment', () => {
  it('空数据 degraded', () => {
    expect(computeIncentiveAlignment([], []).degraded).toBe(true);
  });

  it('增长目标+长期激励 = 高对齐', () => {
    const r = computeIncentiveAlignment(
      [{ goalType: 'innovation' }, { goalType: 'growth' }],
      [{ eventType: 'long_term_incentive' }, { eventType: 'growth_bonus' }]
    );
    expect(r.assessment).toBe('aligned');
    expect(r.score).toBeGreaterThan(0.6);
    expect(r.degraded).toBe(false);
  });

  it('增长目标+短期KPI = 低对齐', () => {
    const r = computeIncentiveAlignment(
      [{ goalType: 'innovation' }, { goalType: 'growth' }],
      [{ eventType: 'quarterly_kpi' }, { eventType: 'cost_cut' }]
    );
    expect(r.assessment).toBe('misaligned');
    expect(r.score).toBeLessThan(0.4);
  });

  it('无增长目标+短期事件 = misaligned', () => {
    const r = computeIncentiveAlignment(
      [{ goalType: 'operational' }],
      [{ eventType: 'quarterly_kpi' }]
    );
    expect(r.assessment).toBe('misaligned');
    expect(r.growthGoalRatio).toBe(0);
  });
});
