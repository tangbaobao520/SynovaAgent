import { describe, it, expect } from 'vitest';
import { computeAssetTurnover } from '../../extensions/sentinels/capital-turnover/computes/asset-turnover';
import { computeReceivableTurnover } from '../../extensions/sentinels/capital-turnover/computes/receivable-turnover';
describe('computeAssetTurnover', () => {
  it('空degraded', () => { expect(computeAssetTurnover([]).degraded).toBe(true); });
  it('正常', () => { const r = computeAssetTurnover([{revenue:500,totalAssets:400,currentAssets:200}]); expect(r.totalTurnover).toBe(1.25); expect(r.degraded).toBe(false); });
});
describe('computeReceivableTurnover', () => {
  it('空degraded', () => { expect(computeReceivableTurnover([]).degraded).toBe(true); });
  it('天数', () => { const r = computeReceivableTurnover([{revenue:365,accountsReceivable:100}]); expect(r.daysOutstanding).toBe(100); });
});
