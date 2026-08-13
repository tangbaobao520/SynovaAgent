import { describe, it, expect } from 'vitest';
import { computeKzIndex } from '../../../extensions/sentinels/financing-constraint/computes/kz-index';
describe('computeKzIndex', () => {
  it('空degraded', () => { expect(computeKzIndex([]).degraded).toBe(true); });
  it('高杠杆=高KZ', () => {
    const r = computeKzIndex([{operatingCashFlow:10, netPpe:100, totalDebt:80, equity:20, cash:5}]);
    expect(r.kzIndex).toBeGreaterThan(0);
    expect(r.degraded).toBe(false);
  });
  it('多期加总', () => {
    const r = computeKzIndex([{operatingCashFlow:5, netPpe:50, totalDebt:30, equity:70, cash:10}, {operatingCashFlow:8, netPpe:60, totalDebt:40, equity:60, cash:15}]);
    expect(r.kzIndex).not.toBe(0);
  });
});
