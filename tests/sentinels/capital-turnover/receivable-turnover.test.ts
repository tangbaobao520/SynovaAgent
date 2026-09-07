/**
 * receivable-turnover.test.ts — computeReceivableTurnover 契约测试
 * D584 对齐: retired capital-turnover/computes → capital-health/computes live 契约
 * （asset: {total_revenue, total_assets, current_assets}; receivable: {total_revenue, receivables}）。
 */
import { describe, it, expect } from 'vitest';
import { computeAssetTurnover } from '../../../extensions/sentinels/capital-health/computes/asset-turnover';
import { computeReceivableTurnover } from '../../../extensions/sentinels/capital-health/computes/receivable-turnover';

describe('computeAssetTurnover', () => {
  it('空 degraded', () => { expect(computeAssetTurnover([]).degraded).toBe(true); });
  it('正常', () => { const r = computeAssetTurnover([{ total_revenue: 500, total_assets: 400, current_assets: 200 }]); expect(r.totalTurnover).toBe(1.25); expect(r.degraded).toBe(false); });
});
describe('computeReceivableTurnover', () => {
  it('空 degraded', () => { expect(computeReceivableTurnover([]).degraded).toBe(true); });
  it('天数: DSO = round(365 / (营收/应收))', () => { const r = computeReceivableTurnover([{ total_revenue: 365, receivables: 100 }]); expect(r.daysOutstanding).toBe(100); });
});
