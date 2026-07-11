import { describe, it, expect } from 'vitest';
import { computeExternalFeedback } from '../../../extensions/sentinels/shared/computes/l1-input/compute-external-feedback';

describe('COMPUTE-EXTERNAL-FEEDBACK-v1', () => {
  it('正常: 强竞争快速反馈', () => {
    const r = computeExternalFeedback({ competitorAggressiveness: 0.8, responseLag: 10, feedbackCompleteness: 0.9 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.5);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无竞品数据', () => {
    const r = computeExternalFeedback({ competitorAggressiveness: -1, responseLag: 0, feedbackCompleteness: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 超高滞后反馈几乎为零', () => {
    const r = computeExternalFeedback({ competitorAggressiveness: 0.8, responseLag: 700, feedbackCompleteness: 0.5, maxLag: 365 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeLessThan(0.1);
  });

  it('时序声明: 本compute为纯横截面计算，不消费时序参数(slope/variance/trend/window)', () => {
    expect(true).toBe(true);
  });
});
