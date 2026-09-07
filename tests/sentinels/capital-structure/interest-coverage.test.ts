/**
 * interest-coverage.test.ts — computeInterestCoverage 契约测试
 * D584 对齐: retired capital-structure/computes → capital-health/computes live 契约
 * （input: {operating_cashflow, interest_expense}[]; result: icr/ebit/interestExpense/degraded）。
 */
import { describe, it, expect } from 'vitest';
import { computeInterestCoverage } from '../../../extensions/sentinels/capital-health/computes/interest-coverage';

describe('computeInterestCoverage', () => {
  it('空 degraded', () => { expect(computeInterestCoverage([]).degraded).toBe(true); });
  it('ICR 计算', () => {
    const r = computeInterestCoverage([{ operating_cashflow: 100, interest_expense: 20 }]);
    expect(r.icr).toBe(5);
  });
});
