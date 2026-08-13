import { describe, it, expect } from 'vitest';
import { computeDataSiloScore } from '../../../extensions/sentinels/data-health/computes/data-silo-score';

describe('computeDataSiloScore', () => {
  it('空系统 degraded', () => {
    const r = computeDataSiloScore([{ id: '1', name: 'S1' }], []);
    expect(r.degraded).toBe(true);
  });

  it('全连通零孤岛', () => {
    const r = computeDataSiloScore(
      [{ id: '1', name: 'S1' }, { id: '2', name: 'S2' }],
      [{ from: '1', to: '2' }],
    );
    expect(r.siloRate).toBe(0);
  });

  it('孤立节点提高孤岛率', () => {
    const r = computeDataSiloScore(
      [{ id: '1', name: 'S1' }, { id: '2', name: 'S2' }, { id: '3', name: 'S3' }],
      [{ from: '1', to: '2' }],
    );
    expect(r.siloCount).toBe(1);
  });
});
