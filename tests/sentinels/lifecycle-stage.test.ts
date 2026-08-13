import { describe, it, expect } from 'vitest';
import { computeLifecycleStage } from '../../extensions/sentinels/market-lifecycle/computes/lifecycle-stage';

describe('E1: computeLifecycleStage', () => {
  it('should return degraded for zero revenue', () => {
    const r = computeLifecycleStage({ currentRevenue: 0, previousRevenue: 100, competitorEntries: 0, competitorExits: 0, totalCompetitors: 0 });
    expect(r.degraded).toBe(true);
    expect(r.stage).toBe('introduction');
  });

  it('should identify growth stage with high growth and net entry', () => {
    const r = computeLifecycleStage({ currentRevenue: 130, previousRevenue: 100, competitorEntries: 8, competitorExits: 1, totalCompetitors: 15 });
    expect(r.degraded).toBe(false);
    expect(r.stage).toBe('growth');
  });

  it('should identify maturity with low growth and stable competition', () => {
    const r = computeLifecycleStage({ currentRevenue: 52, previousRevenue: 50, competitorEntries: 2, competitorExits: 2, totalCompetitors: 25 });
    expect(r.degraded).toBe(false);
    expect(['maturity', 'shakeout']).toContain(r.stage);
  });
});
