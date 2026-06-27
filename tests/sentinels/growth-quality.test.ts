import { describe, it, expect } from 'vitest';
import { computeCashConversionRate } from '../../extensions/sentinels/growth-quality/computes/cash-conversion-rate';
import { computeOrganicGrowthPct } from '../../extensions/sentinels/growth-quality/computes/organic-growth-pct';
describe('computeCashConversionRate', () => {
  it('空degraded', () => { expect(computeCashConversionRate([]).degraded).toBe(true); });
  it('全转化=1', () => {
    const r = computeCashConversionRate([{ operatingCashFlow: 80, netIncome: 100, revenue: 500 }]);
    expect(r.rate).toBe(0.8);
    expect(r.degraded).toBe(false);
  });
});
describe('computeOrganicGrowthPct', () => {
  it('空degraded', () => { expect(computeOrganicGrowthPct([]).degraded).toBe(true); });
  it('纯有机增长', () => {
    const r = computeOrganicGrowthPct([{ revenue: 120, previousRevenue: 100, acquisitionRevenue: 0 }]);
    expect(r.organicPct).toBeGreaterThan(0.9);
  });
  it('并购依赖', () => {
    const r = computeOrganicGrowthPct([{ revenue: 200, previousRevenue: 100, acquisitionRevenue: 80 }]);
    expect(r.organicPct).toBeLessThan(0.5);
  });
});
