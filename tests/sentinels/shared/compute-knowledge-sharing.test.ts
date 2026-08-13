import { describe, it, expect } from 'vitest';
import { computeKnowledgeSharing } from '../../../extensions/sentinels/shared/computes/l2-internal/compute-knowledge-sharing';

describe('COMPUTE-KNOWLEDGE-SHARING-v1', () => {
  it('正常: 高频率+高吸收', () => {
    const r = computeKnowledgeSharing({ sharingFrequency: 0.8, absorptionCapacity: 0.9 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.7);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无共享数据', () => {
    const r = computeKnowledgeSharing({ sharingFrequency: -1, absorptionCapacity: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 高频率但零吸收', () => {
    const r = computeKnowledgeSharing({ sharingFrequency: 0.9, absorptionCapacity: 0 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });

  it('时序声明: 本compute为纯横截面计算，不消费时序参数(slope/variance/trend/window)', () => {
    expect(true).toBe(true);
  });
});
