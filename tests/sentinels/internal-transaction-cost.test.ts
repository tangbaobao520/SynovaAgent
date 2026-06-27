import { describe, it, expect } from 'vitest';
import { computeTransactionCostTrend } from '../../extensions/sentinels/internal-transaction-cost/computes/transaction-cost-trend';
describe('computeTransactionCostTrend', () => {
  it('零成本degraded', () => { expect(computeTransactionCostTrend({totalCost:0,adminCost:0,teamCount:0,eventCount:0,previousAdminCost:0,previousTotalCost:0}).degraded).toBe(true); });
  it('管理比计算', () => { const r = computeTransactionCostTrend({totalCost:1000,adminCost:200,teamCount:5,eventCount:10,previousAdminCost:180,previousTotalCost:1000}); expect(r.adminCostRatio).toBe(0.2); expect(r.degraded).toBe(false); });
  it('上升趋势检测', () => { const r = computeTransactionCostTrend({totalCost:1000,adminCost:300,teamCount:10,eventCount:20,previousAdminCost:100,previousTotalCost:1000}); expect(r.trend).toBeGreaterThan(0.1); });
});
