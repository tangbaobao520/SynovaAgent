import { describe, it, expect } from 'vitest';
import { computeShadowItScore } from '../../../../extensions/sentinels/software-health/computes/shadow-it-score';

describe('computeShadowItScore', () => {
  it('空返回 degraded', () => {
    expect(computeShadowItScore([]).degraded).toBe(true);
  });

  it('全授权零风险', () => {
    const r = computeShadowItScore([
      { id: '1', name: 'T1', authorized: true, category: 'a' },
    ]);
    expect(r.unauthorizedRate).toBe(0);
  });

  it('高风险检测', () => {
    const r = computeShadowItScore([
      { id: '1', name: 'Bad', authorized: false, category: 'file_sharing' },
    ]);
    expect(r.highRiskUnauthorized.length).toBeGreaterThan(0);
  });
});
