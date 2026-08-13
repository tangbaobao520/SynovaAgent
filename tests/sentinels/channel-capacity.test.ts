import { describe, it, expect } from 'vitest';
import { computeChannelCapacity } from '../../extensions/sentinels/channel-capacity/computes/compute-channel-capacity';

describe('computeChannelCapacity', () => {
  it('空数据 degraded', () => {
    expect(computeChannelCapacity(0, 0, 0).degraded).toBe(true);
  });

  it('适中规模 = 健康', () => {
    const r = computeChannelCapacity(30, 4, 60);
    expect(r.assessment).toBe('healthy');
    expect(r.degraded).toBe(false);
  });

  it('人均事件多 = 过载', () => {
    const r = computeChannelCapacity(5, 1, 50);
    expect(r.assessment).toBe('overloaded');
  });

  it('无人员 = underutilized', () => {
    expect(computeChannelCapacity(0, 3, 10).assessment).toBe('underutilized');
  });
});
