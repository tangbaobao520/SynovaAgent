/**
 * tests/sentinels/shared/d62-me-sentinels.test.ts — D62 ME Sentinels
 *
 * 覆盖: 6个现有manifest post-processors + 2个新哨兵
 * 约束: ≥18测试 / 零as any
 */
import { describe, it, expect } from 'vitest';
import { computeBreakEven } from '../../../extensions/sentinels/unit-economics/computes/break-even';
import { computeDOL } from '../../../extensions/sentinels/shared/computes/l2-value/compute-dol';
import { computeNPV } from '../../../extensions/sentinels/shared/computes/l2-internal/compute-npv';
import { computeHHI } from '../../../extensions/sentinels/shared/computes/l4-competition/compute-hhi';
import { computeLearningRate } from '../../../extensions/sentinels/shared/computes/l2-value/compute-learning-rate';
import { computeAgencyCost } from '../../../extensions/sentinels/shared/computes/l2-internal/compute-agency-cost';

// ═══ Group A: 7 post-processor compute integration tests ═══

describe('D62 — unit-economics post-processor: computeBreakEven', () => {
  it('正常: BEP计算含interpretation', () => {
    const r = computeBreakEven(100000, 50, 30, 8000);
    expect(r.economicInterpretation.bepClassification).toBe('far_below');
    expect(r.economicInterpretation.actionImplication).toBeTruthy();
    expect(r.degraded).toBe(false);
  });
  it('降级: 无效输入', () => {
    const r = computeBreakEven(0, 0, 0);
    expect(r.degraded).toBe(true);
  });
});

describe('D62 — capital-health post-processor: computeDOL', () => {
  it('正常: DOL计算含interpretation', () => {
    const r = computeDOL(10000, 4000, 3000);
    expect(r.economicInterpretation.dolClassification).toBeTruthy();
    expect(r.economicInterpretation.riskLevel).toBeTruthy();
    expect(r.degraded).toBe(false);
  });
  it('降级: EBIT为负', () => {
    const r = computeDOL(1000, 2000, 500);
    expect(r.degraded).toBe(true);
  });
});

describe('D62 — capital-health post-processor: computeNPV', () => {
  it('正常: NPV计算含interpretation', () => {
    const r = computeNPV(10000, [3000, 4000, 5000], 0.1);
    expect(r.economicInterpretation.npvInterpretation).toBeTruthy();
    expect(r.degraded).toBe(false);
  });
  it('降级: 无效输入', () => {
    const r = computeNPV(0, [], 0.1);
    expect(r.degraded).toBe(true);
  });
});

describe('D62 — competitive-position post-processor: computeHHI', () => {
  it('正常: HHI含interpretation', () => {
    const r = computeHHI([0.3, 0.25, 0.2, 0.15, 0.1]);
    expect(r.economicInterpretation.marketConcentrationClassification).toBeTruthy();
    expect(r.degraded).toBe(false);
  });
  it('降级: 空输入', () => {
    const r = computeHHI([]);
    expect(r.degraded).toBe(true);
  });
});

describe('D62 — knowledge-accessibility post-processor: computeLearningRate', () => {
  it('正常: 学习率含interpretation', () => {
    const r = computeLearningRate({ unitCostT0: 100, unitCostT: 70, cumulativeOutput: 5000 });
    expect(r.economicInterpretation.learningRateInterpretation).toBeTruthy();
    expect(r.degraded).toBe(false);
  });
  it('降级: 样本不足', () => {
    const r = computeLearningRate({ unitCostT0: 100, unitCostT: 70, cumulativeOutput: 1 });
    expect(r.degraded).toBe(true);
  });
});

describe('D62 — incentive-alignment post-processor: computeAgencyCost', () => {
  it('正常: 代理成本含interpretation', () => {
    const r = computeAgencyCost(500, 300, 200, 10000);
    expect(r.economicInterpretation.agencyCostBreakdown).toBeTruthy();
    expect(r.degraded).toBe(false);
  });
  it('降级: 无效输入', () => {
    const r = computeAgencyCost(100, 50, 30, -1);
    expect(r.degraded).toBe(true);
  });
});

// ═══ Group B: 2 new sentinel structure ═══

// D965 裁撤: 两件为硬编码桩（check 收错第 1 参 / 从不碰 store / input 为字面量），
// 已 git mv 至 _extinct/。断言随迁并显式标注归档态——保留导出形状契约，
// 不删除覆盖（删覆盖会让「归档物被悄悄改坏」失去唯一探针）。
describe('D62 — sentinels exist（D965 起两件已归档 _extinct/）', () => {
  it('pricing-strategy aggregate.ts exports sentinel（已归档）', async () => {
    const mod = await import('../../../extensions/sentinels/_extinct/sentinel-pricing-strategy/aggregate');
    expect(mod.pricingStrategySentinel).toBeDefined();
    expect(typeof mod.pricingStrategySentinel.check).toBe('function');
  });
  it('forecast-accuracy aggregate.ts exports sentinel（已归档）', async () => {
    const mod = await import('../../../extensions/sentinels/_extinct/sentinel-forecast-accuracy/aggregate');
    expect(mod.forecastAccuracySentinel).toBeDefined();
    expect(typeof mod.forecastAccuracySentinel.check).toBe('function');
  });
});
