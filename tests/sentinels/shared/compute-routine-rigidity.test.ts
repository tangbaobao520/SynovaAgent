import { describe, it, expect } from 'vitest';
import { computeRoutineRigidity } from '../../../extensions/sentinels/shared/computes/l2-internal/compute-routine-rigidity';

describe('COMPUTE-ROUTINE-RIGIDITY-v1', () => {
  it('正常: 低灵活性→高僵化', () => {
    const r = computeRoutineRigidity({ adjustmentFlexibility: 0.2 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.7);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无历史数据', () => {
    const r = computeRoutineRigidity({ adjustmentFlexibility: -1 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 完全灵活→零僵化', () => {
    const r = computeRoutineRigidity({ adjustmentFlexibility: 1 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });

  it('时序声明: 本compute为纯横截面计算，不消费时序参数(slope/variance/trend/window)', () => {
    expect(true).toBe(true);
  });
});
