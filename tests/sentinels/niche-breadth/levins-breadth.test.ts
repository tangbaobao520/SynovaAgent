import { describe, it, expect } from 'vitest';
import { computeLevinsBreadth } from '../../../extensions/sentinels/niche-breadth/computes/levins-breadth';
describe('computeLevinsBreadth', () => {
  it('空degraded', () => { expect(computeLevinsBreadth([]).degraded).toBe(true); });
  it('均匀分布=高B', () => {
    const r = computeLevinsBreadth([{name:'A',value:1},{name:'B',value:1},{name:'C',value:1}]);
    expect(r.breadth).toBeCloseTo(3, 0.5);
    expect(r.depth).toBeCloseTo(1/3, 2);
    expect(r.degraded).toBe(false);
  });
  it('单一市场=B=1', () => {
    const r = computeLevinsBreadth([{name:'A',value:100}]);
    expect(r.breadth).toBe(1);
    expect(r.depth).toBe(1);
  });
});
