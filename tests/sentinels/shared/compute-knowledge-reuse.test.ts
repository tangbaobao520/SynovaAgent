import { describe, it, expect } from 'vitest';
import { computeKnowledgeReuse } from '../../../extensions/sentinels/shared/computes/l5-reinput/compute-knowledge-reuse';

describe('COMPUTE-KNOWLEDGE-REUSE-v1', () => {
  it('正常: 高频复用低衰减', () => {
    const r = computeKnowledgeReuse({ reuseFrequency: 0.8, knowledgeDecay: 0.1 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.7);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无知识数据', () => {
    const r = computeKnowledgeReuse({ reuseFrequency: -1, knowledgeDecay: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 全衰减', () => {
    const r = computeKnowledgeReuse({ reuseFrequency: 0.8, knowledgeDecay: 1 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });
});
