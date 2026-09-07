/**
 * capital-turnover.test.ts — 资本周转 computes 组合回归
 * D584 对齐: retired capital-turnover/computes → capital-health/computes live 契约。
 */
import { describe, it, expect } from 'vitest';
import { computeAssetTurnover } from '../../extensions/sentinels/capital-health/computes/asset-turnover';
import { computeReceivableTurnover } from '../../extensions/sentinels/capital-health/computes/receivable-turnover';

describe('computeAssetTurnover', () => {
  it('空 degraded', () => { expect(computeAssetTurnover([]).degraded).toBe(true); });
  it('正常', () => { const r = computeAssetTurnover([{ total_revenue: 500, total_assets: 400, current_assets: 200 }]); expect(r.totalTurnover).toBe(1.25); expect(r.degraded).toBe(false); });
});
describe('computeReceivableTurnover', () => {
  it('空 degraded', () => { expect(computeReceivableTurnover([]).degraded).toBe(true); });
  it('天数', () => { const r = computeReceivableTurnover([{ total_revenue: 365, receivables: 100 }]); expect(r.daysOutstanding).toBe(100); });
});
