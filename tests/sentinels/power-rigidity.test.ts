import { describe, it, expect } from 'vitest';
import { computeFinkelsteinPowerIndex } from '../../extensions/sentinels/power-rigidity/computes/compute-power-rigidity';

describe('computeFinkelsteinPowerIndex', () => {
  it('空数据 degraded', () => {
    const r = computeFinkelsteinPowerIndex({ totalPeople: 0, ceoDecisionApprovals: 0, totalDecisionApprovals: 0, founderEquity: 0 });
    expect(r.degraded).toBe(true);
  });

  it('>20% manager ratio = rigid signal', () => {
    const r = computeFinkelsteinPowerIndex({ totalPeople: 10, ceoDecisionApprovals: 4, totalDecisionApprovals: 5, founderEquity: 0.8, managerCount: 4 });
    expect(r.managerRatio).toBe(0.4);
    expect(r.powerIndex).toBeGreaterThan(0);
  });

  it('stage0-1 exemption for <20 people', () => {
    const r = computeFinkelsteinPowerIndex({ totalPeople: 15, ceoDecisionApprovals: 10, totalDecisionApprovals: 12, founderEquity: 0.9 });
    expect(r.stageExempt).toBe(true);
    expect(r.signal).toBe('stage0_exempt');
  });

  it('returns all 4 power dimensions', () => {
    const r = computeFinkelsteinPowerIndex({ totalPeople: 100, ceoDecisionApprovals: 60, totalDecisionApprovals: 100, founderEquity: 0.6 });
    expect(r.structuralPower).toBeGreaterThan(0);
    expect(r.ownershipPower).toBe(0.6);
    expect(r.expertisePower).toBe(0.5); // default
    expect(r.prestigePower).toBe(0.5); // default
  });
});
