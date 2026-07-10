import { describe, it, expect } from 'vitest';
import { computeDecisionAuthority } from '../../../extensions/sentinels/shared/computes/l2-internal/compute-decision-authority';

describe('COMPUTE-DECISION-AUTHORITY-v1', () => {
  it('正常: 低集中度→高分散授权', () => {
    const r = computeDecisionAuthority({ concentrationIndex: 0.2 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.7);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无治理结构数据', () => {
    const r = computeDecisionAuthority({ concentrationIndex: -1 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 高度集中→零授权', () => {
    const r = computeDecisionAuthority({ concentrationIndex: 1 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });
});
