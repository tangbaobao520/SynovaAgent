import { describe, it, expect } from 'vitest';
import { computeSaasUsageScore } from '../../../../extensions/sentinels/software-health/computes/saas-usage-score';

describe('computeSaasUsageScore', () => {
  it('空返回 degraded', () => {
    expect(computeSaasUsageScore([]).degraded).toBe(true);
  });

  it('活跃提高利用率', () => {
    const r = computeSaasUsageScore([
      { id: '1', name: 'S1', status: 'active', category: 'cat' },
    ]);
    expect(r.usageRate).toBe(1);
  });

  it('重叠检测', () => {
    const r = computeSaasUsageScore([
      { id: '1', name: 'A', status: 'active', category: 'x' },
      { id: '2', name: 'B', status: 'active', category: 'x' },
      { id: '3', name: 'C', status: 'idle', category: 'x' },
    ]);
    expect(r.overlappingCategories.length).toBe(1);
  });
});
