import { describe, it, expect } from 'vitest';
import { computeTechInfrastructure } from '../../../extensions/sentinels/shared/computes/l3-output/compute-tech-infrastructure';

describe('COMPUTE-TECH-INFRASTRUCTURE-v1', () => {
  it('正常: 高杠杆+高可用', () => {
    const r = computeTechInfrastructure({ techLeverageRatio: 0.8, systemUptime: 0.99 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.7);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无IT数据', () => {
    const r = computeTechInfrastructure({ techLeverageRatio: -1, systemUptime: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 零可用', () => {
    const r = computeTechInfrastructure({ techLeverageRatio: 0.8, systemUptime: 0 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });
});
