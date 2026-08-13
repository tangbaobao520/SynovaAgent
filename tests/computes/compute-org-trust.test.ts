/**
 * tests/computes/compute-org-trust.test.ts
 *
 * E-21 ORG_TRUST — 组织信任指数与协作评分
 * 覆盖: 正常/降级/边界
 */
import { describe, it, expect } from 'vitest';
import { computeOrgTrust } from '../../extensions/sentinels/shared/computes/l2-internal/compute-org-trust';

describe('computeOrgTrust', () => {
  it('正常参数 → 返回信任评分', () => {
    const result = computeOrgTrust({ trustIndex: 0.8, collaborationScore: 0.9 });
    expect(result.degraded).toBe(false);
    expect(result.value).toBeGreaterThan(0.5);
    expect(result.confidence).toBe('high');
  });

  it('两类均缺失 → 降级', () => {
    const result = computeOrgTrust({ trustIndex: -1, collaborationScore: -1 });
    expect(result.degraded).toBe(true);
    expect(result.value).toBe(0);
  });

  it('边界值 → 不崩溃', () => {
    const result = computeOrgTrust({ trustIndex: 1.5, collaborationScore: -0.5 });
    expect(result.degraded).toBe(false);
    expect(result.value).toBeGreaterThanOrEqual(0);
  });
});
