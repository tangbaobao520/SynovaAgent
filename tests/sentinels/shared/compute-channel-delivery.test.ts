import { describe, it, expect } from 'vitest';
import { computeChannelDelivery } from '../../../extensions/sentinels/shared/computes/l4-capture/compute-channel-delivery';

describe('COMPUTE-CHANNEL-DELIVERY-v1', () => {
  it('正常: 高效率广触达', () => {
    const r = computeChannelDelivery({ channelEfficiency: 0.8, reachRatio: 0.9 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.7);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无渠道数据', () => {
    const r = computeChannelDelivery({ channelEfficiency: -1, reachRatio: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 零触达', () => {
    const r = computeChannelDelivery({ channelEfficiency: 0.8, reachRatio: 0 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });
});
