import { describe, it, expect } from 'vitest';
import { computePowerRigidity } from '../../extensions/sentinels/power-rigidity/computes/compute-power-rigidity';

describe('computePowerRigidity', () => {
  it('空数据 degraded', () => {
    expect(computePowerRigidity(0, 0).degraded).toBe(true);
  });

  it('管理比>20% = 刚性', () => {
    const r = computePowerRigidity(10, 4);
    expect(r.assessment).toBe('rigid');
    expect(r.managerRatio).toBe(0.4);
    expect(r.degraded).toBe(false);
  });

  it('管理比<10% = 松散', () => {
    const r = computePowerRigidity(20, 1);
    expect(r.assessment).toBe('loose');
  });

  it('管理比10-20% = 平衡', () => {
    const r = computePowerRigidity(20, 3);
    expect(r.assessment).toBe('balanced');
  });
});
