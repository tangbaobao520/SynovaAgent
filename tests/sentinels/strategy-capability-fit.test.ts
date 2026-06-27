import { describe, it, expect } from 'vitest';
import { computeStrategyCapabilityFit } from '../../extensions/sentinels/strategy-capability-fit/computes/compute-strategy-capability-fit';

describe('computeStrategyCapabilityFit', () => {
  it('空数据返回 degraded', () => {
    const r = computeStrategyCapabilityFit([], []);
    expect(r.degraded).toBe(true);
  });

  it('有战略目标无核心能力应报告差距', () => {
    const r = computeStrategyCapabilityFit(
      [{ name: '扩张市场', goalType: 'strategic' }],
      [{ name: '行政支持', category: 'supporting' }]
    );
    expect(r.alignmentGaps.length).toBeGreaterThan(0);
    expect(r.degraded).toBe(false);
  });

  it('战略目标与核心能力匹配应得中等以上分数', () => {
    const r = computeStrategyCapabilityFit(
      [{ name: '创新', goalType: 'innovation' }, { name: '扩张', goalType: 'strategic' }],
      [{ name: '研发团队', category: 'core_competence', level: 4 }, { name: '销售团队', category: 'core_competence', level: 3 }]
    );
    expect(r.score).toBeGreaterThan(0.5);
    expect(r.strategicGoals).toBe(2);
    expect(r.coreCapabilities).toBe(2);
  });

  it('运营目标+支撑能力应得低分', () => {
    const r = computeStrategyCapabilityFit(
      [{ name: '日常运营', goalType: 'operational' }],
      [{ name: '基础能力', category: 'supporting' }]
    );
    expect(r.score).toBeLessThan(0.3);
  });
});
