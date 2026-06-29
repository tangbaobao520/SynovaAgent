import { describe, it, expect } from 'vitest';
import { computeCapitalTurnover } from '../../../../extensions/sentinels/capital-efficiency/computes/capital-turnover';

describe('computeCapitalTurnover', () => {
  it('空列表 degraded', () => {
    expect(computeCapitalTurnover([]).degraded).toBe(true);
  });
  it('正常计算', () => {
    const r = computeCapitalTurnover([{ revenue: 500, totalDebt: 100, equity: 150 }]);
    expect(r.turnover).toBeCloseTo(500 / 250, 2);
    expect(r.degraded).toBe(false);
  });
});
