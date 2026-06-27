import { describe, it, expect } from 'vitest';
import { computeTalentDensity } from '../../extensions/sentinels/talent-density/computes/compute-talent-density';

describe('computeTalentDensity', () => {
  it('空数据 degraded', () => { expect(computeTalentDensity(0, 0).degraded).toBe(true); });

  it('高技能>40% = 高密度', () => {
    const r = computeTalentDensity(10, 5);
    expect(r.assessment).toBe('high');
    expect(r.density).toBe(0.5);
    expect(r.degraded).toBe(false);
  });

  it('高技能<20% = 低密度', () => {
    const r = computeTalentDensity(20, 2);
    expect(r.assessment).toBe('low');
    expect(r.highSkillRatio).toBe(0.1);
  });

  it('中间 = 中等', () => {
    const r = computeTalentDensity(10, 3);
    expect(r.assessment).toBe('moderate');
  });
});
