import { describe, it, expect } from 'vitest';
import { computeSelfAwareness } from '../../../../extensions/sentinels/self-awareness/computes/bias.ts';

const mockStore = {
  queryNodes: () => [],
  queryEdges: () => [],
};

describe('SelfAwareness', () => {
  it('返回有效结构 {value, threshold, metadata}', async () => {
    const r = await computeSelfAwareness(mockStore as any, 'test-team');
    expect(r).toHaveProperty('value');
    expect(r).toHaveProperty('threshold');
    expect(r).toHaveProperty('metadata');
  });
  it('threshold ∈ {ok, warning, critical}', async () => {
    const r = await computeSelfAwareness(mockStore as any, 'test-team');
    expect(['ok','warning','critical']).toContain(r.threshold);
  });
  it('metadata 非空对象', async () => {
    const r = await computeSelfAwareness(mockStore as any, 'test-team');
    expect(typeof r.metadata).toBe('object');
    expect(Object.keys(r.metadata).length).toBeGreaterThan(0);
  });
});
