import { describe, it, expect } from 'vitest';
import { computeStructuralChangeSignal } from '../../extensions/sentinels/structural-change/computes/structural-change-signal';

describe('computeStructuralChangeSignal', () => {
  it('空degraded', () => {
    expect(computeStructuralChangeSignal([]).degraded).toBe(true);
  });
  it('技术事件增加分数', () => {
    const r = computeStructuralChangeSignal([{ eventType: 'technology_change' }, { eventType: 'technology_change' }]);
    expect(r.score).toBeGreaterThan(0);
    expect(r.degraded).toBe(false);
  });
  it('多种变化叠加', () => {
    const r = computeStructuralChangeSignal([{ eventType: 'technology_change' }, { eventType: 'regulatory_change' }, { eventType: 'economic_shift' }]);
    expect(r.signals.length).toBeGreaterThanOrEqual(1);
  });
});
