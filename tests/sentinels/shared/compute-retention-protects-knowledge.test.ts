import { describe, it, expect } from 'vitest';
import { computeRetentionProtectsKnowledge } from '../../../extensions/sentinels/shared/computes/l5-reinput/compute-retention-protects-knowledge';

describe('COMPUTE-RETENTION-PROTECTS-KNOWLEDGE-v1', () => {
  it('正常: 高留存低流失', () => {
    const r = computeRetentionProtectsKnowledge({ retentionRate: 0.9, knowledgeLossRate: 0.1 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.7);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无数据', () => {
    const r = computeRetentionProtectsKnowledge({ retentionRate: -1, knowledgeLossRate: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 全流失', () => {
    const r = computeRetentionProtectsKnowledge({ retentionRate: 0.9, knowledgeLossRate: 1 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });
});
