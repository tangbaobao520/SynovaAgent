import { describe, it, expect } from 'vitest';
import { computeFixedCostRigidity } from '../../../extensions/sentinels/unit-economics/computes/fixed-cost-rigidity';

describe('computeFixedCostRigidity', () => {
  it('should classify factory rent as rigid', () => {
    const r = computeFixedCostRigidity([{ name: 'Factory Rent', amount: 50000 }]);
    expect(r.costItems[0].reducible).toBe(false);
    expect(r.rigidityRatio).toBe(1);
  });

  it('should classify IT subscriptions as partially reducible', () => {
    const r = computeFixedCostRigidity([{ name: 'Cloud SaaS', amount: 10000 }]);
    expect(r.costItems[0].reducible).toBe(true);
    expect(r.totalReducible).toBeGreaterThan(0);
  });

  it('should degrade on empty data', () => {
    const r = computeFixedCostRigidity([]);
    expect(r.degraded).toBe(true);
  });

  it('should handle mixed cost structure', () => {
    const r = computeFixedCostRigidity([
      { name: 'Factory Rent', amount: 50000 },
      { name: 'Cloud SaaS', amount: 10000 },
      { name: 'Marketing', amount: 20000 },
    ]);
    expect(r.rigidityRatio).toBeLessThan(1);
    expect(r.totalFixed).toBeGreaterThan(r.totalReducible);
  });
});
