import { describe, it, expect } from 'vitest';
import { computeRoicWaccSpread } from '../../../extensions/sentinels/capital-efficiency/computes/roic-wacc-spread';
import { computeCapitalTurnover } from '../../../extensions/sentinels/capital-efficiency/computes/capital-turnover';

describe('computeRoicWaccSpread', () => {
  it('空列表 degraded', () => {
    expect(computeRoicWaccSpread([]).degraded).toBe(true);
  });

  it('高利润应产生正价差', () => {
    const r = computeRoicWaccSpread([
      { revenue: 1000, cost: 400, operatingExpenses: 200 },
    ]);
    expect(r.roic).toBeGreaterThan(r.wacc);
    expect(r.degraded).toBe(false);
  });

  it('自定义WACC', () => {
    const r = computeRoicWaccSpread([
      { revenue: 100, cost: 90, operatingExpenses: 20, waccOverride: 0.15 },
    ]);
    expect(r.wacc).toBe(0.15);
  });
});

describe('computeCapitalTurnover', () => {
  it('空列表 degraded', () => {
    expect(computeCapitalTurnover([]).degraded).toBe(true);
  });

  it('有营收有资本', () => {
    const r = computeCapitalTurnover([
      { revenue: 1000, totalDebt: 200, equity: 300 },
    ]);
    expect(r.turnover).toBeCloseTo(1000 / 500, 2);
    expect(r.degraded).toBe(false);
  });
});
