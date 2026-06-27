import { describe, it, expect } from 'vitest';
import { computeKnowledgeAccessibility } from '../../extensions/sentinels/knowledge-accessibility/computes/compute-knowledge-accessibility';

describe('computeKnowledgeAccessibility', () => {
  it('空数据 degraded', () => {
    expect(computeKnowledgeAccessibility(0, 0, 0, 0).degraded).toBe(true);
  });

  it('多知识少人员 = 高可调用', () => {
    const r = computeKnowledgeAccessibility(5, 3, 2, 2);
    expect(r.assessment).toBe('high');
    expect(r.degraded).toBe(false);
  });

  it('多人员无知识 = 低可调用', () => {
    const r = computeKnowledgeAccessibility(0, 0, 0, 10);
    expect(r.assessment).toBe('low');
    expect(r.documentedRate).toBe(0);
  });

  it('部分知识文档化 = 中等', () => {
    const r = computeKnowledgeAccessibility(1, 0, 1, 3);
    expect(r.assessment).toBe('medium');
    expect(r.score).toBeGreaterThan(0.1);
    expect(r.score).toBeLessThan(0.7);
  });
});
