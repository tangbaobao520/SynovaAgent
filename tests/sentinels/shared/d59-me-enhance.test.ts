/**
 * tests/sentinels/shared/d59-me-enhance.test.ts — D59 ME Compute Enhance
 *
 * 验证7个compute函数追加的 economic_interpretation 字段。
 * 每个compute至少2测试: 正常路径验证interpretation + 降级路径验证interpretation不为空
 * 约束: ≥14测试 / 零as any
 */
import { describe, it, expect } from 'vitest';
import { computeBreakEven } from '../../../extensions/sentinels/unit-economics/computes/break-even';
import { computeMarginalContribution } from '../../../extensions/sentinels/unit-economics/computes/marginal-contribution';
import { computeLearningRate } from '../../../extensions/sentinels/shared/computes/l2-value/compute-learning-rate';
import { computeDOL } from '../../../extensions/sentinels/shared/computes/l2-value/compute-dol';
import { computeNPV } from '../../../extensions/sentinels/shared/computes/l2-internal/compute-npv';
import { computeHHI } from '../../../extensions/sentinels/shared/computes/l4-competition/compute-hhi';
import { computeAgencyCost } from '../../../extensions/sentinels/shared/computes/l2-internal/compute-agency-cost';

describe('D59 — computeBreakEven ME interpretation', () => {
  it('正常路径: economicInterpretation含4个子字段', () => {
    const r = computeBreakEven(100000, 50, 30, 8000);
    expect(r.economicInterpretation.bepClassification).toBe('far_below');
    expect(r.economicInterpretation.safetyMarginValue).toBeGreaterThan(0);
    expect(r.economicInterpretation.fixedCostStructure).toBeTruthy();
    expect(r.economicInterpretation.actionImplication).toBeTruthy();
  });

  it('降级路径: interpretation不为空', () => {
    const r = computeBreakEven(0, 0, 0);
    expect(r.degraded).toBe(true);
    expect(r.economicInterpretation.bepClassification).toBe('unknown');
    expect(r.economicInterpretation.actionImplication).toBeTruthy();
  });
});

describe('D59 — computeMarginalContribution ME interpretation', () => {
  it('正常路径: economicInterpretation含3个子字段', () => {
    const r = computeMarginalContribution([
      { groupId: 'g1', revenue: 1000, variableCost: 400 },
      { groupId: 'g2', revenue: 2000, variableCost: 1200 },
    ]);
    expect(r.economicInterpretation.scaleEconomyDiagnosis).toBeTruthy();
    expect(r.economicInterpretation.optimalVolumeEstimate).toBeTruthy();
    expect(r.economicInterpretation.costStructureAdvice).toBeTruthy();
  });

  it('降级路径: interpretation不为空', () => {
    const r = computeMarginalContribution([]);
    expect(r.degraded).toBe(true);
    expect(r.economicInterpretation.scaleEconomyDiagnosis).toBe('unknown');
  });
});

describe('D59 — computeLearningRate ME interpretation', () => {
  it('正常路径: economicInterpretation含3个子字段', () => {
    const r = computeLearningRate({ unitCostT0: 100, unitCostT: 70, cumulativeOutput: 5000 });
    expect(r.economicInterpretation.learningRateInterpretation).toBeTruthy();
    expect(r.economicInterpretation.costReductionForecast).toBeTruthy();
    expect(r.economicInterpretation.organizationalImplication).toBeTruthy();
  });

  it('降级路径: interpretation不为空', () => {
    const r = computeLearningRate({ unitCostT0: 100, unitCostT: 70, cumulativeOutput: 1 });
    expect(r.degraded).toBe(true);
    expect(r.economicInterpretation.learningRateInterpretation).toBe('negative');
  });
});

describe('D59 — computeDOL ME interpretation', () => {
  it('正常路径: economicInterpretation含3个子字段', () => {
    const r = computeDOL(10000, 4000, 3000);
    expect(r.economicInterpretation.dolClassification).toBeTruthy();
    expect(r.economicInterpretation.directionAmplification).toBeTruthy();
    expect(r.economicInterpretation.riskLevel).toBeTruthy();
  });

  it('降级路径: interpretation不为空', () => {
    const r = computeDOL(1000, 2000, 500);
    expect(r.degraded).toBe(true);
    expect(r.economicInterpretation.dolClassification).toBe('high');
  });
});

describe('D59 — computeNPV ME interpretation', () => {
  it('正常路径: economicInterpretation含3个子字段', () => {
    const r = computeNPV(10000, [3000, 4000, 5000, 3000], 0.1);
    expect(r.economicInterpretation.npvInterpretation).toBeTruthy();
    expect(r.economicInterpretation.discountSensitivity).toBeTruthy();
    expect(r.economicInterpretation.investmentAdvice).toBeTruthy();
  });

  it('降级路径: interpretation不为空', () => {
    const r = computeNPV(0, [], 0.1);
    expect(r.degraded).toBe(true);
    expect(r.economicInterpretation.npvInterpretation).toBe('value_destroying');
  });
});

describe('D59 — computeHHI ME interpretation', () => {
  it('正常路径: economicInterpretation含3个子字段', () => {
    const r = computeHHI([0.3, 0.25, 0.2, 0.15, 0.1]);
    expect(r.economicInterpretation.marketConcentrationClassification).toBeTruthy();
    expect(r.economicInterpretation.mergerImplication).toBeTruthy();
    expect(r.economicInterpretation.pricingPowerAssessment).toBeTruthy();
  });

  it('降级路径: interpretation不为空', () => {
    const r = computeHHI([]);
    expect(r.degraded).toBe(true);
    expect(r.economicInterpretation.marketConcentrationClassification).toBe('unknown');
  });
});

describe('D59 — computeAgencyCost ME interpretation', () => {
  it('正常路径: economicInterpretation含3个子字段', () => {
    const r = computeAgencyCost(500, 300, 200, 10000);
    expect(r.economicInterpretation.agencyCostBreakdown).toBeTruthy();
    expect(r.economicInterpretation.governanceRecommendation).toBeTruthy();
    expect(r.economicInterpretation.efficiencyRating).toBeTruthy();
  });

  it('降级路径: interpretation不为空', () => {
    const r = computeAgencyCost(100, 50, 30, -1);
    expect(r.degraded).toBe(true);
    expect(r.economicInterpretation.agencyCostBreakdown).toBe('unknown');
  });
});
