import { describe, it, expect } from 'vitest';
import { computeVariableCosts } from './variable-costs';

describe('computeVariableCosts', () => {
  it('should classify variable vs fixed costs', () => {
    const r = computeVariableCosts([
      { name: 'Material', amount: 50000, costType: 'variable' },
      { name: 'Rent', amount: 30000, costType: 'fixed' },
    ]);
    expect(r.variableCosts.length).toBe(1);
    expect(r.fixedCosts.length).toBe(1);
    expect(r.totalVariableMonthly).toBe(50000);
    expect(r.totalFixedMonthly).toBe(30000);
    expect(r.degraded).toBe(false);
  });

  it('should degrade on empty data', () => {
    const r = computeVariableCosts([]);
    expect(r.degraded).toBe(true);
  });

  it('should classify client-linked costs as variable', () => {
    const r = computeVariableCosts([{ name: 'Commission', amount: 20000, costType: 'fixed', linkedToNodeType: 'Client' }]);
    expect(r.variableCosts.length).toBe(1);
    expect(r.fixedCosts.length).toBe(0);
  });
});
