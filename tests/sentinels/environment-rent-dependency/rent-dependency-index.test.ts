import { describe, it, expect } from 'vitest';
import { computeRentDependencyIndex } from '../../../extensions/sentinels/environment-rent-dependency/computes/rent-dependency-index';

describe('computeRentDependencyIndex', () => {
  it('空数据degraded', () => {
    expect(computeRentDependencyIndex([]).degraded).toBe(true);
  });
  it('补贴依赖提高指数', () => {
    const r = computeRentDependencyIndex([{ type: 'subsidy', value: 50 }, { type: 'revenue', value: 100 }]);
    expect(r.index).toBeGreaterThan(0.3);
  });
});
