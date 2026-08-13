import { describe, it, expect } from 'vitest';
import { computeBrandPremium } from '../../extensions/sentinels/competitive-moat-perceptual/computes/brand-premium';
import { computeCustomerLoyalty } from '../../extensions/sentinels/competitive-moat-perceptual/computes/customer-loyalty';
describe('computeBrandPremium', () => {
  it('空degraded', () => { expect(computeBrandPremium([]).degraded).toBe(true); });
  it('高价=正溢价', () => { const r = computeBrandPremium([{name:'A',price:150,category:'cat'},{name:'B',price:50,category:'cat'}]); expect(r.premium).toBeGreaterThan(0); });
});
describe('computeCustomerLoyalty', () => {
  it('空degraded', () => { expect(computeCustomerLoyalty([]).degraded).toBe(true); });
  it('高NPS=高忠诚', () => { const r = computeCustomerLoyalty([{nps:80,tenure:36,revenue:100}]); expect(r.loyalty).toBeGreaterThan(0.5); });
});
