import { describe, it, expect } from 'vitest';
import { computeCustomerLockin } from '../../../extensions/sentinels/shared/computes/l4-capture/compute-customer-lockin';

describe('COMPUTE-CUSTOMER-LOCKIN-v1', () => {
  it('正常: 高切换成本+深锁定', () => {
    const r = computeCustomerLockin({ switchingCost: 0.9, lockTypeDepth: 0.8 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.7);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无客户数据', () => {
    const r = computeCustomerLockin({ switchingCost: -1, lockTypeDepth: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 零切换成本', () => {
    const r = computeCustomerLockin({ switchingCost: 0, lockTypeDepth: 0.8 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });
});
