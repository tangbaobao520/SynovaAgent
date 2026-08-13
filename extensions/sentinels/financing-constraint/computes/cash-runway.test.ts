import { describe, it, expect } from 'vitest';
import { computeCashRunway } from './cash-runway';

describe('computeCashRunway', () => {
  it('should return healthy for >12mo runway', () => {
    const r = computeCashRunway([{ cash: 1000000, operatingExpense: 50000 }]);
    expect(r.signal).toBe('healthy');
    expect(r.runwayMonths).toBeGreaterThanOrEqual(20);
    expect(r.degraded).toBe(false);
  });

  it('should warn when runway <12mo', () => {
    const r = computeCashRunway([{ cash: 500000, operatingExpense: 60000 }]);
    expect(r.signal).toBe('warning');
    expect(r.runwayMonths).toBeLessThan(12);
  });

  it('should be critical when runway <6mo', () => {
    const r = computeCashRunway([{ cash: 100000, operatingExpense: 50000 }]);
    expect(r.signal).toBe('critical');
    expect(r.runwayMonths).toBeLessThan(6);
  });

  it('should degrade on empty data', () => {
    const r = computeCashRunway([]);
    expect(r.degraded).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
