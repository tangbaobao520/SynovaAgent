import { describe, it, expect } from 'vitest';
import { computeCashConversionCycle } from '../../../extensions/sentinels/capital-turnover/computes/cash-conversion-cycle';

describe('computeCashConversionCycle', () => {
  it('should compute CCC for standard inputs', () => {
    const r = computeCashConversionCycle({ cogs: 1000000, inventory: 200000, accountsReceivable: 150000, accountsPayable: 100000, revenue: 2000000 });
    expect(r.cccDays).toBeGreaterThan(0);
    expect(r.dio).toBeGreaterThan(0);
    expect(r.dso).toBeGreaterThan(0);
    expect(r.dpo).toBeGreaterThan(0);
    expect(r.degraded).toBe(false);
  });

  it('should degrade on zero revenue/cogs', () => {
    const r = computeCashConversionCycle({ cogs: 0, inventory: 0, accountsReceivable: 0, accountsPayable: 0, revenue: 0 });
    expect(r.degraded).toBe(true);
  });

  it('should be critical when CCC > 120 days', () => {
    const r = computeCashConversionCycle({ cogs: 100000, inventory: 80000, accountsReceivable: 70000, accountsPayable: 10000, revenue: 200000 });
    expect(r.signal).toBe('critical');
    expect(r.cccDays).toBeGreaterThan(120);
  });
});
