/**
 * debt-structure.test.ts — F2 computeDebtStructure 测试
 */
import { describe, it, expect } from 'vitest';
import { computeDebtStructure } from './debt-structure';

describe('computeDebtStructure', () => {
  it('should flag critical when shortTermDebt > 70% of total', () => {
    const r = computeDebtStructure({ shortTermDebt: 800000, totalDebt: 1000000 });
    expect(r.signal).toBe('critical');
    expect(r.shortTermRatio).toBe(0.8);
    expect(r.degraded).toBe(false);
  });

  it('should warn when shortTermDebt > 50% of total', () => {
    const r = computeDebtStructure({ shortTermDebt: 600000, totalDebt: 1000000 });
    expect(r.signal).toBe('warning');
    expect(r.shortTermRatio).toBe(0.6);
  });

  it('should be healthy when mostly long-term debt', () => {
    const r = computeDebtStructure({ shortTermDebt: 200000, totalDebt: 1000000 });
    expect(r.signal).toBe('healthy');
    expect(r.shortTermRatio).toBe(0.2);
  });

  it('should degrade on zero total debt', () => {
    const r = computeDebtStructure({ shortTermDebt: 0, totalDebt: 0 });
    expect(r.degraded).toBe(true);
  });
});
