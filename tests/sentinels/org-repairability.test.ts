import { describe, it, expect } from 'vitest';
import { computeOrgRepairability } from '../../extensions/sentinels/org-repairability/computes/compute-org-repairability';

describe('computeOrgRepairability', () => {
  it('空数据 degraded', () => {
    expect(computeOrgRepairability(0, 0).degraded).toBe(true);
  });

  it('全修复 = 强', () => {
    const r = computeOrgRepairability(10, 10);
    expect(r.assessment).toBe('strong');
    expect(r.repairRate).toBe(1);
    expect(r.degraded).toBe(false);
  });

  it('少修复 = 弱', () => {
    const r = computeOrgRepairability(10, 2);
    expect(r.assessment).toBe('weak');
    expect(r.repairRate).toBe(0.2);
  });

  it('部分修复 = 中等', () => {
    const r = computeOrgRepairability(10, 6);
    expect(r.assessment).toBe('moderate');
    expect(r.repairRate).toBe(0.6);
  });
});
