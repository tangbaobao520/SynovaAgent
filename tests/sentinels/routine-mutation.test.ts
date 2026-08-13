import { describe, it, expect } from 'vitest';
import { computeRoutineMutation } from '../../extensions/sentinels/routine-mutation/computes/compute-routine-mutation';

describe('computeRoutineMutation', () => {
  it('空数据返回 degraded', () => {
    const r = computeRoutineMutation([], []);
    expect(r.degraded).toBe(true);
  });

  it('无变更标记为僵化', () => {
    const r = computeRoutineMutation(
      [{ id: 'p1', updated: false }, { id: 'p2', updated: false }],
      []
    );
    expect(r.assessment).toBe('frozen');
    expect(r.mutationRate).toBe(0);
    expect(r.degraded).toBe(false);
  });

  it('部分变更标记为健康', () => {
    const r = computeRoutineMutation(
      [{ id: 'p1', updated: true }, { id: 'p2', updated: false }, { id: 'p3', updated: false }],
      []
    );
    expect(r.assessment).toBe('healthy');
    expect(r.mutationRate).toBeGreaterThan(0);
    expect(r.mutationRate).toBeLessThan(0.4);
  });

  it('大量变更 + 变革事件标记为不稳定', () => {
    const r = computeRoutineMutation(
      [{ id: 'p1', updated: true }, { id: 'p2', updated: true }],
      [{ eventType: 'process_change' }, { eventType: 'process_change' }]
    );
    expect(r.assessment).toBe('unstable');
    expect(r.mutatedRoutines).toBeGreaterThanOrEqual(2);
  });

  it('变革事件增加变异率', () => {
    const r1 = computeRoutineMutation([{ id: 'p1', updated: false }], [{ eventType: 'process_change' }]);
    const r2 = computeRoutineMutation([{ id: 'p1', updated: false }], []);
    expect(r1.mutationRate).toBeGreaterThan(r2.mutationRate);
  });
});
