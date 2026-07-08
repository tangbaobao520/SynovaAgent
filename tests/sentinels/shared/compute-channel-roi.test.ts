import { describe, it, expect } from 'vitest';
import { computeChannelROI } from '../../../extensions/sentinels/shared/computes/l2-value/compute-channel-roi';

describe('computeChannelROI', () => {
  it('normal: positive ROI', () => {
    const r = computeChannelROI(100, 150);
    expect(r.degraded).toBe(false);
    expect(r.roi).toBe(0.5);
  });

  it('degraded: zero cost', () => {
    const r = computeChannelROI(0, 100);
    expect(r.degraded).toBe(true);
  });

  it('boundary: negative revenue (loss)', () => {
    const r = computeChannelROI(100, 50);
    expect(r.degraded).toBe(false);
    expect(r.roi).toBe(-0.5);
  });
});
