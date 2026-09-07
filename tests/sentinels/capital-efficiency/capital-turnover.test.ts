/**
 * capital-turnover.test.ts — computeCapitalTurnover 契约测试
 * D584 对齐: retired capital-efficiency/computes → capital-health/computes live 契约
 * （input: {total_revenue, total_debt?, equity?}[]; result: turnover/totalRevenue/totalCapital/degraded）。
 */
import { describe, it, expect } from 'vitest';
import { computeCapitalTurnover } from '../../../extensions/sentinels/capital-health/computes/capital-turnover';

describe('computeCapitalTurnover', () => {
  it('空列表 degraded', () => {
    expect(computeCapitalTurnover([]).degraded).toBe(true);
  });
  it('正常计算: 营收 / (负债+权益)', () => {
    const r = computeCapitalTurnover([{ total_revenue: 500, total_debt: 100, equity: 150 }]);
    expect(r.turnover).toBeCloseTo(500 / 250, 2);
    expect(r.degraded).toBe(false);
  });
});
