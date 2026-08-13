import { describe, it, expect } from 'vitest';
import { computeValueCaptureScore } from '../../extensions/sentinels/value-capture/computes/value-capture-score';
describe('computeValueCaptureScore', () => {
  it('空degraded', () => { expect(computeValueCaptureScore([]).degraded).toBe(true); });
  it('高利润=高捕获', () => { const r = computeValueCaptureScore([{revenue:1000,cost:400,netProfit:200,previousRevenue:800}]); expect(r.captureIndex).toBeGreaterThan(0.4); expect(r.degraded).toBe(false); });
  it('低毛利=低捕获', () => { const r = computeValueCaptureScore([{revenue:1000,cost:950,netProfit:10,previousRevenue:1000}]); expect(r.captureIndex).toBeLessThan(0.3); });
});
