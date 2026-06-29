import { describe, it, expect } from 'vitest';
import { computeRoicWaccSpread } from '../../../../extensions/sentinels/capital-efficiency/computes/roic-wacc-spread';

describe('computeRoicWaccSpread', () => {
  it('空列表 degraded', () => {
    expect(computeRoicWaccSpread([]).degraded).toBe(true);
  });
  it('盈利产生正价差', () => {
    const r = computeRoicWaccSpread([{ revenue: 500, cost: 200, operatingExpenses: 100 }]);
    expect(r.roic).toBeGreaterThan(r.wacc);
    expect(r.degraded).toBe(false);
  });
});
