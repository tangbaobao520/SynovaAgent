import { describe, it, expect } from 'vitest';
import { computeMarginalContribution } from '../../../extensions/sentinels/unit-economics/computes/marginal-contribution';

describe('computeMarginalContribution', () => {
  it('should compute MC per group', () => {
    const r = computeMarginalContribution([
      { groupId: 'g1', revenue: 100000, variableCost: 40000 },
      { groupId: 'g2', revenue: 50000, variableCost: 30000 },
    ]);
    expect(r.groups.length).toBe(2);
    expect(r.groups[0].mcRatio).toBeCloseTo(0.6, 1);
    expect(r.totalContribution).toBeGreaterThan(0);
    expect(r.degraded).toBe(false);
  });

  it('should detect negative MC groups', () => {
    const r = computeMarginalContribution([{ groupId: 'bad', revenue: 10000, variableCost: 15000 }]);
    expect(r.negativeMcGroups).toBe(1);
    expect(r.groups[0].isPositive).toBe(false);
  });

  it('should degrade on empty data', () => {
    const r = computeMarginalContribution([]);
    expect(r.degraded).toBe(true);
  });
});
