import { describe, it, expect } from 'vitest';
import { computeTalentRetention } from '../../../extensions/sentinels/shared/computes/l5-reinput/compute-talent-retention';

describe('COMPUTE-TALENT-RETENTION-v1', () => {
  it('正常: 高留存高满意', () => {
    const r = computeTalentRetention({ retentionRate: 0.9, satisfactionScore: 0.85 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.7);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无人事数据', () => {
    const r = computeTalentRetention({ retentionRate: -1, satisfactionScore: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 零留存', () => {
    const r = computeTalentRetention({ retentionRate: 0, satisfactionScore: 0.8 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });
});
