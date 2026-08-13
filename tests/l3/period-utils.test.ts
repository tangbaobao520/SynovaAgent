/**
 * tests/l3/period-utils.test.ts — D33: period → valid_from/valid_to 推导测试
 */
import { describe, it, expect } from 'vitest';
import { deriveValidFrom, deriveValidTo } from '../../src/l3/period-utils';

describe('deriveValidFrom', () => {
  it('quarter Q1 → 2026-01-01', () => expect(deriveValidFrom('2026-Q1')).toBe('2026-01-01'));
  it('quarter Q3 → 2026-07-01', () => expect(deriveValidFrom('2026-Q3')).toBe('2026-07-01'));
  it('month → 2026-06-01', () => expect(deriveValidFrom('2026-06')).toBe('2026-06-01'));
  it('year → 2026-01-01', () => expect(deriveValidFrom('2026')).toBe('2026-01-01'));
  it('exact date → same', () => expect(deriveValidFrom('2026-06-15')).toBe('2026-06-15'));
});

describe('deriveValidTo', () => {
  it('quarter Q1 → 2026-03-31', () => expect(deriveValidTo('2026-Q1')).toBe('2026-03-31'));
  it('quarter Q4 → 2026-12-31', () => expect(deriveValidTo('2026-Q4')).toBe('2026-12-31'));
  it('month → last day', () => { const r = deriveValidTo('2026-02'); expect(r).toMatch(/^2026-02-2[89]$/); });
  it('year → 2026-12-31', () => expect(deriveValidTo('2026')).toBe('2026-12-31'));
  it('exact date → same', () => expect(deriveValidTo('2026-06-15')).toBe('2026-06-15'));
});
