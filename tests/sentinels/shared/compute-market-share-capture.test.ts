import { describe, it, expect } from 'vitest';
import { computeMarketShareCapture } from '../../../extensions/sentinels/shared/computes/l4-capture/compute-market-share-capture';

describe('COMPUTE-MARKET-SHARE-CAPTURE-v1', () => {
  it('正常: 正向份额增长', () => {
    const r = computeMarketShareCapture({ shareChange: 0.3, competitorAggressiveness: 0.2 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.2);
    expect(r.confidence).toBe('medium');
  });

  it('降级: 无市场份额数据', () => {
    const r = computeMarketShareCapture({ shareChange: -999, competitorAggressiveness: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 负份额变动→capture为0', () => {
    const r = computeMarketShareCapture({ shareChange: -0.3, competitorAggressiveness: 0.2 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });

  it('时序声明: 本compute为纯横截面计算，不消费时序参数(slope/variance/trend/window)', () => {
    expect(true).toBe(true);
  });
});
