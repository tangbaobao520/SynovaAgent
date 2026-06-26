import { describe, it, expect } from 'vitest';
import { computeLifecycleStage } from '../../extensions/sentinels/market-lifecycle/computes/lifecycle-stage';

describe('computeLifecycleStage', () => {
  it('高增长正净进入=growth', () => {
    const r = computeLifecycleStage({ currentRevenue: 200, previousRevenue: 100, competitorEntries: 5, competitorExits: 1, totalCompetitors: 20 });
    expect(r.stage).toBe('growth');
    expect(r.industryGrowthRate).toBe(1);
  });

  it('负增长=decline', () => {
    const r = computeLifecycleStage({ currentRevenue: 50, previousRevenue: 100, competitorEntries: 0, competitorExits: 5, totalCompetitors: 20 });
    expect(r.stage).toBe('decline');
  });

  it('零数据=introduction/degraded', () => {
    const r = computeLifecycleStage({ currentRevenue: 0, previousRevenue: 0, competitorEntries: 0, competitorExits: 0, totalCompetitors: 0 });
    expect(r.degraded).toBe(true);
  });
});
