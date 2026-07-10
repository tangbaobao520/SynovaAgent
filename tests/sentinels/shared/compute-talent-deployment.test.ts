import { describe, it, expect } from 'vitest';
import { computeTalentDeployment } from '../../../extensions/sentinels/shared/computes/l2-internal/compute-talent-deployment';

describe('COMPUTE-TALENT-DEPLOYMENT-v1', () => {
  it('正常: 高人岗匹配+强团队构成', () => {
    const r = computeTalentDeployment({ personSkillMatch: 0.9, teamCompositionScore: 0.8 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.7);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无人员数据', () => {
    const r = computeTalentDeployment({ personSkillMatch: -1, teamCompositionScore: 0.5 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 低匹配低团队', () => {
    const r = computeTalentDeployment({ personSkillMatch: 0.1, teamCompositionScore: 0.2 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeLessThan(0.1);
  });
});
