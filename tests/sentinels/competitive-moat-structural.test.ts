import { describe, it, expect } from 'vitest';
import { computeScaleEconomy } from '../../extensions/sentinels/competitive-moat-structural/computes/scale-economy-score';
import { computeNetworkEffect } from '../../extensions/sentinels/competitive-moat-structural/computes/network-effect-score';
import { computeCounterPositioningSlm } from '../../extensions/sentinels/competitive-moat-structural/computes/counter-positioning-slm';
describe('computeScaleEconomy', () => {
  it('空degraded', () => { expect(computeScaleEconomy([]).degraded).toBe(true); });
  it('收入高=高规模', () => { const r = computeScaleEconomy([{revenue:300,totalAssets:100}]); expect(r.score).toBeGreaterThan(0.5); });
});
describe('computeNetworkEffect', () => {
  it('空degraded', () => { expect(computeNetworkEffect([]).degraded).toBe(true); });
  it('多平台增加效应', () => { const r = computeNetworkEffect([{id:'1',type:'Tool'},{id:'2',type:'Tool'}]); expect(r.score).toBeGreaterThan(0); });
});
describe('computeCounterPositioningSlm', () => {
  it('满足条件返回SLM', () => { const r = computeCounterPositioningSlm({incumbentMargin:0.6,incumbentPrice:100,ourPrice:50,ourRevenue:10,incumbentRevenue:5000}); expect(r.applicable).toBe(true); });
  it('规模不对等不满足', () => { const r = computeCounterPositioningSlm({incumbentMargin:0.3,incumbentPrice:100,ourPrice:80,ourRevenue:5000,incumbentRevenue:5000}); expect(r.applicable).toBe(false); });
});
