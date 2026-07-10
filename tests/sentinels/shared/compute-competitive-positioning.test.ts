import { describe, it, expect } from 'vitest';
import { computeCompetitivePositioning } from '../../../extensions/sentinels/shared/computes/l4-capture/compute-competitive-positioning';

describe('COMPUTE-COMPETITIVE-POSITIONING-v1', () => {
  it('正常: 七力全面领先', () => {
    const r = computeCompetitivePositioning({
      switchingCost: 0.8, networkEffect: 0.7, scaleEconomy: 0.9,
      counterPositioning: 0.6, brandMoat: 0.8, exclusiveResource: 0.5, processAdvantage: 0.7,
    });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.5);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无竞品数据', () => {
    const r = computeCompetitivePositioning({
      switchingCost: -1, networkEffect: 0.5, scaleEconomy: 0.5,
      counterPositioning: 0.5, brandMoat: 0.5, exclusiveResource: 0.5, processAdvantage: 0.5,
    });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 七力全低', () => {
    const r = computeCompetitivePositioning({
      switchingCost: 0.1, networkEffect: 0.1, scaleEconomy: 0.1,
      counterPositioning: 0.1, brandMoat: 0.1, exclusiveResource: 0.1, processAdvantage: 0.1,
    });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeLessThan(0.2);
  });
});
