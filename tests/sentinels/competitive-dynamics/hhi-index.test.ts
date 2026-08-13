import { describe, it, expect } from 'vitest';
import { computeHhiIndex } from '../../../extensions/sentinels/competitive-dynamics/computes/hhi-index';
import { computeCompetitiveIntensity } from '../../../extensions/sentinels/competitive-dynamics/computes/competitive-intensity';

describe('computeHhiIndex', () => {
  it('单企业=10000', () => {
    const r = computeHhiIndex([{ name: 'A', revenue: 100 }]);
    expect(r.hhi).toBe(10000);
    expect(r.concentration).toBe('high');
  });

  it('均匀分布=低集中', () => {
    const r = computeHhiIndex([{ name: 'A', revenue: 10 }, { name: 'B', revenue: 10 }, { name: 'C', revenue: 10 }]);
    expect(r.hhi).toBeLessThan(3500); // 3等分=3333, HHI<3500=低集中
  });

  it('空=degraded', () => {
    expect(computeHhiIndex([]).degraded).toBe(true);
  });
});

describe('computeCompetitiveIntensity', () => {
  it('多竞争者低增长=高强度', () => {
    const r = computeCompetitiveIntensity({ competitorCount: 15, recentEntries: 3, recentExits: 2, marketGrowth: 0.02 });
    expect(r.intensity).toBeGreaterThan(0.5);
  });
});
