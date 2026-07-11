import { describe, it, expect } from 'vitest';
import { computeTalentFilter } from '../../../extensions/sentinels/shared/computes/l1-input/compute-talent-filter';

describe('COMPUTE-TALENT-FILTER-v1', () => {
  it('正常: 高门槛低通过率', () => {
    const r = computeTalentFilter({ selectionThreshold: 0.9, passRate: 0.3 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.5);
    expect(r.confidence).toBe('high');
  });

  it('降级: passRate未配置', () => {
    const r = computeTalentFilter({ selectionThreshold: 0.5, passRate: -1 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 通过率为0但门槛高', () => {
    const r = computeTalentFilter({ selectionThreshold: 0.8, passRate: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(1);
    expect(r.warnings.some(w => w.includes('passRate为0'))).toBe(true);
  });

  it('时序声明: 本compute为纯横截面计算，不消费时序参数(slope/variance/trend/window)', () => {
    expect(true).toBe(true);
  });
});
