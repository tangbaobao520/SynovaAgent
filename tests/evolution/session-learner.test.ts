import { describe, it, expect } from 'vitest';
import { SessionLearner } from '@synova/evolution';

describe('SessionLearner', () => {
  it('初始权重为空', () => {
    const learner = new SessionLearner();
    expect(learner.getWeights()).toEqual([]);
    expect(learner.isActive()).toBe(true);
  });

  it('否定假设 → 权重变为负值', () => {
    const learner = new SessionLearner();
    learner.onHypothesisNegated('H1', '数据不支撑');
    expect(learner.getWeight('H1')).toBe(-0.2);
  });

  it('多次否定 → 累加但不低于 -1.0', () => {
    const learner = new SessionLearner();
    for (let i = 0; i < 10; i++) {
      learner.onHypothesisNegated('H1');
    }
    expect(learner.getWeight('H1')).toBe(-1.0); // 下限
  });

  it('确认假设 → 权重变为正值', () => {
    const learner = new SessionLearner();
    learner.onHypothesisConfirmed('H2', '确实如此');
    expect(learner.getWeight('H2')).toBe(0.3);
  });

  it('多次确认 → 累加但不高于 1.0', () => {
    const learner = new SessionLearner();
    for (let i = 0; i < 10; i++) {
      learner.onHypothesisConfirmed('H2');
    }
    expect(learner.getWeight('H2')).toBe(1.0); // 上限
  });

  it('否定+确认 → 权重抵扣', () => {
    const learner = new SessionLearner();
    learner.onHypothesisNegated('H1');
    learner.onHypothesisConfirmed('H1');
    expect(learner.getWeight('H1')).toBeCloseTo(0.1); // -0.2 + 0.3 = 0.1
  });

  it('getNegatedHypotheses → 只返回负权重的假设', () => {
    const learner = new SessionLearner();
    learner.onHypothesisNegated('H_bad');
    learner.onHypothesisConfirmed('H_good');
    const negated = learner.getNegatedHypotheses();
    expect(negated).toHaveLength(1);
    expect(negated[0].hypothesisId).toBe('H_bad');
  });

  it('getConfirmedHypotheses → 只返回正权重的假设', () => {
    const learner = new SessionLearner();
    learner.onHypothesisNegated('H_bad');
    learner.onHypothesisConfirmed('H_good');
    const confirmed = learner.getConfirmedHypotheses();
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].hypothesisId).toBe('H_good');
  });

  it('维度关注 → 维度权重递增', () => {
    const learner = new SessionLearner();
    learner.onDimensionFocused('finance');
    learner.onDimensionFocused('finance');
    expect(learner.getWeight('dim_finance')).toBe(0.2);
  });

  it('endSession → 后续调用被忽略', () => {
    const learner = new SessionLearner();
    learner.endSession();
    learner.onHypothesisNegated('H1');
    expect(learner.getWeight('H1')).toBe(0); // 被忽略
    expect(learner.isActive()).toBe(false);
  });

  it('reset → 清空所有权重', () => {
    const learner = new SessionLearner();
    learner.onHypothesisNegated('H1');
    learner.onHypothesisConfirmed('H2');
    learner.reset();
    expect(learner.getWeights()).toEqual([]);
    expect(learner.isActive()).toBe(true);
  });

  it('getWeights → 按权重降序排列', () => {
    const learner = new SessionLearner();
    learner.onHypothesisConfirmed('H_good');
    learner.onHypothesisNegated('H_bad');
    learner.onHypothesisNegated('H_worst');
    learner.onHypothesisNegated('H_worst');
    const sorted = learner.getWeights();
    expect(sorted[0].hypothesisId).toBe('H_good'); // 0.3 最高
    expect(sorted[2].hypothesisId).toBe('H_worst'); // -0.4 最低
  });
});
