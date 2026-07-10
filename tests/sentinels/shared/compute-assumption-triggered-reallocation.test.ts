import { describe, it, expect } from 'vitest';
import { computeAssumptionTriggeredReallocation } from '../../../extensions/sentinels/shared/computes/cross-cycle/compute-assumption-triggered-reallocation';

describe('COMPUTE-ASSUMPTION-TRIGGERED-REALLOCATION-v1', () => {
  it('正常: 超过阈值触发重分配', () => {
    const r = computeAssumptionTriggeredReallocation({ assumptionBreachLevel: 0.9, reallocationTriggerThreshold: 0.6 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无假设数据', () => {
    const r = computeAssumptionTriggeredReallocation({ assumptionBreachLevel: -1, reallocationTriggerThreshold: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 未达到阈值不触发', () => {
    const r = computeAssumptionTriggeredReallocation({ assumptionBreachLevel: 0.3, reallocationTriggerThreshold: 0.7 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });
});
