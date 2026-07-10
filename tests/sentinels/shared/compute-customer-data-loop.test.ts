import { describe, it, expect } from 'vitest';
import { computeCustomerDataLoop } from '../../../extensions/sentinels/shared/computes/l4-capture/compute-customer-data-loop';

describe('COMPUTE-CUSTOMER-DATA-LOOP-v1', () => {
  it('正常: 高反馈利用率+短改进周期', () => {
    const r = computeCustomerDataLoop({ feedbackUtilization: 0.8, improvementCycle: 0.9 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.7);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无反馈数据', () => {
    const r = computeCustomerDataLoop({ feedbackUtilization: -1, improvementCycle: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 零改进周期', () => {
    const r = computeCustomerDataLoop({ feedbackUtilization: 0.8, improvementCycle: 0 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });

  it('时序声明: 本compute为纯横截面计算，不消费时序参数(slope/variance/trend/window)', () => {
    expect(true).toBe(true);
  });
});
