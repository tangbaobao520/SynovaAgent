/**
 * financial-impact.test.ts — 财务归因引擎单元测试
 *
 * 验证: 默认基线计算 / 自定义基线 / simulation / 空数据
 */

import { computeFinancialImpact, simulateImprovement, loadFinancialBaseline, saveFinancialBaseline } from '../financial-impact';
import type { FullDiagnosis, FinancialBaseline } from '../types';

function stubDiagnosis(overrides: Record<string, any> = {}): FullDiagnosis {
  return {
    teamId: 'test-team',
    observedAt: new Date().toISOString(),
    sourcePipeline: 'test',
    narrative: '测试诊断',
    degradedModules: [],
    gaps: {
      teamId: 'test-team',
      observedAt: new Date().toISOString(),
      sourcePipeline: 'phase-c',
      gaps: {
        division_of_labor: { mode: 'fixed', engineScore: 7, confidence: 'high', sourceBreakdown: { test: 1 } },
        information_flow: { mode: 'hub', engineScore: 3, confidence: 'medium', sourceBreakdown: { test: 1 } },
        authority_governance: { mode: 'hierarchy+vote', engineScore: 6, confidence: 'high', sourceBreakdown: { test: 1 } },
        trust_incentive: { mode: 'aligned+high', engineScore: 8, confidence: 'high', sourceBreakdown: { test: 1 } },
        knowledge_sharing: { mode: 'weekly', engineScore: 5, confidence: 'medium', sourceBreakdown: { test: 1 } },
        external_interface: { mode: 'gatekeeper', engineScore: 2, confidence: 'low', sourceBreakdown: { test: 1 } },
      },
    },
    htm: null,
    eob: null,
    financialImpact: null,
    tokenEconomics: null,
    ...overrides,
  };
}

describe('computeFinancialImpact', () => {
  test('默认基线返回财务影响报告', () => {
    const result = computeFinancialImpact(stubDiagnosis());

    expect(result).toHaveProperty('period');
    expect(result).toHaveProperty('totalInefficiencyCost');
    expect(result).toHaveProperty('breakdown');
    expect(result).toHaveProperty('improvementPotential');
    expect(result).toHaveProperty('roi');
    expect(result).toHaveProperty('interpretation');
    expect(result.isEstimated).toBe(true);
    expect(result.breakdown.length).toBeGreaterThan(0);
    expect(typeof result.totalInefficiencyCost).toBe('number');
  });

  test('信息流低分产生延迟成本', () => {
    const diag = stubDiagnosis();
    // Ensure low information_flow score
    (diag.gaps.gaps as any).information_flow.engineScore = 2;

    const result = computeFinancialImpact(diag);
    const delayItem = result.breakdown.find(b => b.sourceDimension === 'information_flow');
    expect(delayItem).toBeDefined();
    expect(delayItem!.monthlyCost).toBeGreaterThan(0);
  });

  test('外部接口低分产生机会成本', () => {
    const diag = stubDiagnosis();
    (diag.gaps.gaps as any).external_interface.engineScore = 1;

    const result = computeFinancialImpact(diag);
    const extItem = result.breakdown.find(b => b.sourceDimension === 'external_interface');
    expect(extItem).toBeDefined();
    expect(extItem!.monthlyCost).toBeGreaterThan(0);
  });

  test('自定义基线覆盖默认值', () => {
    const customBaseline: FinancialBaseline = {
      humanHourlyCost: 200,
      agentHourlyCost: 40,
      delayCostRate: 10000,
      averageErrorCost: 20000,
      opportunityCostRate: 5000,
      modelPricing: [],
      defaultTokenPricePer1M: 20,
    };

    const result = computeFinancialImpact(stubDiagnosis(), customBaseline);
    expect(result.isEstimated).toBe(false);

    // Higher baseline costs → higher inefficiency cost
    const defaultResult = computeFinancialImpact(stubDiagnosis());
    expect(result.totalInefficiencyCost).toBeGreaterThan(defaultResult.totalInefficiencyCost);
  });

  test('全高分诊断无显著低效成本', () => {
    const diag = stubDiagnosis();
    // Set all scores high
    for (const dim of Object.keys(diag.gaps.gaps)) {
      (diag.gaps.gaps as any)[dim].engineScore = 9;
    }
    (diag as any).ipu = { overloadScore: 0.1 };

    const result = computeFinancialImpact(diag);
    // IPU below 0.2 → no efficiency loss; high scores → minimal gap costs
    const ipuItem = result.breakdown.find(b => b.sourceDimension === 'ipu_overload');
    expect(ipuItem).toBeUndefined();
  });

  test('IPU 过载产生效率损失', () => {
    const diag = stubDiagnosis();
    (diag as any).ipu = { overloadScore: 0.6 };

    const result = computeFinancialImpact(diag);
    const ipuItem = result.breakdown.find(b => b.sourceDimension === 'ipu_overload');
    expect(ipuItem).toBeDefined();
    expect(ipuItem!.monthlyCost).toBeGreaterThan(0);
  });

  test('HITL 比例异常产生错误成本', () => {
    const diag = stubDiagnosis();
    (diag as any).hacd = { hitlRatio: 0.8 };

    const result = computeFinancialImpact(diag);
    const trustItem = result.breakdown.find(b => b.sourceDimension === 'trust');
    expect(trustItem).toBeDefined();
    expect(trustItem!.monthlyCost).toBeGreaterThan(0);
  });
});

describe('simulateImprovement', () => {
  test('改善信息流降低总成本', () => {
    const diag = stubDiagnosis();
    (diag.gaps.gaps as any).information_flow.engineScore = 2;

    const before = computeFinancialImpact(diag);
    const after = simulateImprovement(diag, { information_flow: 5 });

    expect(after.totalInefficiencyCost).toBeLessThan(before.totalInefficiencyCost);
  });

  test('改善 IPU 过载降低效率损失', () => {
    const diag = stubDiagnosis();
    (diag as any).ipu = { overloadScore: 0.6 };

    const before = computeFinancialImpact(diag);
    const after = simulateImprovement(diag, { ipu: 0.3 });

    expect(after.totalInefficiencyCost).toBeLessThan(before.totalInefficiencyCost);
  });
});
