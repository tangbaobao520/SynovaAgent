import { describe, it, expect } from 'vitest';
import { computeDataReadiness } from '../../../extensions/sentinels/data-health/computes/data-readiness-score';

describe('computeDataReadiness', () => {
  it('空列表 degraded', () => {
    const r = computeDataReadiness([]);
    expect(r.degraded).toBe(true);
  });

  it('结构化节点高就绪度', () => {
    const r = computeDataReadiness([
      { id: '1', type: 'FINANCIAL', props: { amount: 100, period: '2024Q1' } },
    ]);
    expect(r.readiness).toBeGreaterThan(0.5);
    expect(r.degraded).toBe(false);
  });

  it('name-only 增加缺失率', () => {
    const r = computeDataReadiness([
      { id: '1', type: 'Person', props: { name: '张三' } },
    ]);
    expect(r.missingFieldRate).toBeGreaterThan(0);
  });

  it('PII检测', () => {
    const r = computeDataReadiness([
      { id: '1', type: 'Person', props: { phone: '13800138000' } },
    ]);
    expect(r.piiHitCount).toBe(1);
  });
});
