/**
 * debt-structure.test.ts — computeDebtStructure 契约测试
 * D584 对齐: retired capital-structure/computes → capital-health/computes（input 字段名一致:
 * short_term_debt/total_debt，仅 import 路径对齐）。
 */
import { describe, it, expect } from 'vitest';
import { computeDebtStructure } from '../../../extensions/sentinels/capital-health/computes/debt-structure';

describe('computeDebtStructure', () => {
  it('shortTermDebt > 70% → critical', () => {
    const r = computeDebtStructure({ short_term_debt: 800000, total_debt: 1000000 });
    expect(r.signal).toBe('critical');
    expect(r.shortTermRatio).toBe(0.8);
    expect(r.degraded).toBe(false);
  });

  it('shortTermDebt > 50% → warning', () => {
    const r = computeDebtStructure({ short_term_debt: 600000, total_debt: 1000000 });
    expect(r.signal).toBe('warning');
    expect(r.shortTermRatio).toBe(0.6);
  });

  it('以长期负债为主 → healthy', () => {
    const r = computeDebtStructure({ short_term_debt: 200000, total_debt: 1000000 });
    expect(r.signal).toBe('healthy');
    expect(r.shortTermRatio).toBe(0.2);
  });

  it('零总负债 → degraded', () => {
    const r = computeDebtStructure({ short_term_debt: 0, total_debt: 0 });
    expect(r.degraded).toBe(true);
  });
});
