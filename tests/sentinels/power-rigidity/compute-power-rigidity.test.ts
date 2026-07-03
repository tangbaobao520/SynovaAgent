import { describe, it, expect } from 'vitest';
import { computeFinkelsteinPowerIndex } from '../../../extensions/sentinels/power-rigidity/computes/compute-power-rigidity';

describe('computeFinkelsteinPowerIndex', () => {
  it('should detect strong power concentration', () => {
    const r = computeFinkelsteinPowerIndex({ totalPeople: 100, ceoDecisionApprovals: 80, totalDecisionApprovals: 100, founderEquity: 0.8 });
    expect(r.powerIndex).toBeGreaterThan(0.5);
    expect(r.stageExempt).toBe(false);
  });

  it('should apply stage0-1 exemption for <20 people', () => {
    const r = computeFinkelsteinPowerIndex({ totalPeople: 15, ceoDecisionApprovals: 10, totalDecisionApprovals: 12, founderEquity: 0.9 });
    expect(r.stageExempt).toBe(true);
    expect(r.signal).toBe('stage0_exempt');
  });

  it('should degrade on zero people', () => {
    const r = computeFinkelsteinPowerIndex({ totalPeople: 0, ceoDecisionApprovals: 0, totalDecisionApprovals: 0, founderEquity: 0 });
    expect(r.degraded).toBe(true);
  });
});
