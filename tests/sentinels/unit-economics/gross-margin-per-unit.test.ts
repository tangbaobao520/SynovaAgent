import { describe, it, expect } from 'vitest';
import { computeLtvCac } from '../../extensions/sentinels/unit-economics/computes/ltv-cac-ratio';
import { computeUnitMargin } from '../../extensions/sentinels/unit-economics/computes/gross-margin-per-unit';
describe('computeLtvCac', () => {
  it('空degraded', () => { expect(computeLtvCac([]).degraded).toBe(true); });
  it('健康=3x+', () => { const r = computeLtvCac([{customerLifetimeValue:300,customerAcquisitionCost:100}]); expect(r.ltvCac).toBe(3); });
});
describe('computeUnitMargin', () => {
  it('空degraded', () => { expect(computeUnitMargin([]).degraded).toBe(true); });
  it('毛利计算', () => { const r = computeUnitMargin([{unitRevenue:100,unitCost:60}]); expect(r.margin).toBe(0.4); });
});
