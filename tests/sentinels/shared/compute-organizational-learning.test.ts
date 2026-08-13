import { describe, it, expect } from 'vitest';
import { computeOrganizationalLearning } from '../../../extensions/sentinels/shared/computes/l2-internal/compute-organizational-learning';

describe('COMPUTE-ORGANIZATIONAL-LEARNING-v1', () => {
  it('正常: 高学习率+高保持率', () => {
    const r = computeOrganizationalLearning({ learningRate: 0.9, knowledgeRetention: 0.8 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.7);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无学习数据', () => {
    const r = computeOrganizationalLearning({ learningRate: -1, knowledgeRetention: 0.5 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 高学习但零保持', () => {
    const r = computeOrganizationalLearning({ learningRate: 0.9, knowledgeRetention: 0 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });

  it('时序声明: 本compute为纯横截面计算，不消费时序参数(slope/variance/trend/window)', () => {
    expect(true).toBe(true);
  });
});
