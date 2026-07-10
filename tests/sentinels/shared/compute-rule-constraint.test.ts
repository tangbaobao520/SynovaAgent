import { describe, it, expect } from 'vitest';
import { computeRuleConstraint } from '../../../extensions/sentinels/shared/computes/l2-internal/compute-rule-constraint';

describe('COMPUTE-RULE-CONSTRAINT-v1', () => {
  it('正常: 适当规则+强约束', () => {
    const r = computeRuleConstraint({ ruleAppropriateness: 0.8, constraintEffectiveness: 0.9 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.7);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无规则数据', () => {
    const r = computeRuleConstraint({ ruleAppropriateness: -1, constraintEffectiveness: 0.5 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 低适当性低有效性', () => {
    const r = computeRuleConstraint({ ruleAppropriateness: 0.1, constraintEffectiveness: 0.2 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeLessThan(0.1);
  });
});
