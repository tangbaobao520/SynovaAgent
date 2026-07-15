/**
 * tests/sentinels/shared/d60-me-new-computes.test.ts — D60 17个新compute测试
 *
 * 每个compute至少2测试: 正常路径 + 降级路径 = ≥34测试
 */
import { describe, it, expect } from 'vitest';
import { computeTwoPartTariff } from '../../../extensions/sentinels/shared/computes/l2-value/compute-two-part-tariff';
import { computePriceDiscrimination } from '../../../extensions/sentinels/shared/computes/l2-value/compute-price-discrimination';
import { computeBundlingOptimal } from '../../../extensions/sentinels/shared/computes/l2-value/compute-bundling-optimal';
import { computePeakLoadPricing } from '../../../extensions/sentinels/shared/computes/l2-value/compute-peak-load-pricing';
import { computeOptimalPrice } from '../../../extensions/sentinels/shared/computes/l2-value/compute-optimal-price';
import { computeSurvivalMargin } from '../../../extensions/sentinels/shared/computes/l2-value/compute-survival-margin';
import { computeScaleEconomy } from '../../../extensions/sentinels/shared/computes/l2-value/compute-scale-economy';
import { computeCrossPriceElasticity } from '../../../extensions/sentinels/shared/computes/l2-value/compute-cross-price-elasticity';
import { computeMarketStructureDiagnosis } from '../../../extensions/sentinels/shared/computes/l4-competition/compute-market-structure-diagnosis';
import { computeLernerIndex } from '../../../extensions/sentinels/shared/computes/l4-competition/compute-lerner-index';
import { computeSynergy } from '../../../extensions/sentinels/shared/computes/l4-competition/compute-synergy';
import { computeIRR } from '../../../extensions/sentinels/shared/computes/l2-internal/compute-irr';
import { computeDisposalValue } from '../../../extensions/sentinels/shared/computes/l2-internal/compute-disposal-value';
import { computeDemandForecast } from '../../../extensions/sentinels/shared/computes/l3-causal/compute-demand-forecast';
import { computeConfidenceInterval } from '../../../extensions/sentinels/shared/computes/l3-causal/compute-confidence-interval';
import { computeStatisticalSignificance } from '../../../extensions/sentinels/shared/computes/l3-causal/compute-statistical-significance';
import { computeTimeSeriesDecomposition } from '../../../extensions/sentinels/shared/computes/l3-causal/compute-time-series-decomposition';

describe('D60 — computeTwoPartTariff', () => {
  it('正常: 有interpretation', () => {
    const r = computeTwoPartTariff(100, 50, 30, 1000);
    expect(r.economicInterpretation.pricingStrategy).toBeTruthy();
    expect(r.degraded).toBe(false);
  });
  it('降级: 无效输入', () => {
    const r = computeTwoPartTariff(0, 0, 0, 0);
    expect(r.degraded).toBe(true);
    expect(r.economicInterpretation.pricingStrategy).toBe('unknown');
  });
});
describe('D60 — computePriceDiscrimination', () => {
  it('正常', () => {
    const r = computePriceDiscrimination([{ price: 100, quantity: 50, cost: 60 }, { price: 80, quantity: 100, cost: 55 }, { price: 60, quantity: 200, cost: 50 }]);
    expect(r.economicInterpretation.discriminationLevel).toBeTruthy();
    expect(r.degraded).toBe(false);
  });
  it('降级: <2分段', () => {
    const r = computePriceDiscrimination([{ price: 100, quantity: 50, cost: 60 }]);
    expect(r.degraded).toBe(true);
  });
});
describe('D60 — computeBundlingOptimal', () => {
  it('正常', () => {
    const r = computeBundlingOptimal([{ name: 'A', standalonePrice: 100, cost: 50 }, { name: 'B', standalonePrice: 80, cost: 40 }], 0.2);
    expect(r.bundleSavings).toBeGreaterThan(0);
    expect(r.degraded).toBe(false);
  });
  it('降级: 产品不足', () => {
    const r = computeBundlingOptimal([{ name: 'A', standalonePrice: 100, cost: 50 }], 0.2);
    expect(r.degraded).toBe(true);
  });
});
describe('D60 — computePeakLoadPricing', () => {
  it('正常', () => {
    const r = computePeakLoadPricing([{ label: 'peak', demand: 1000, capacity: 800, marginalCost: 50 }, { label: 'off', demand: 300, capacity: 800, marginalCost: 40 }]);
    expect(r.peakPrice).toBeGreaterThan(r.offPeakPrice);
    expect(r.degraded).toBe(false);
  });
  it('降级: 空数据', () => {
    const r = computePeakLoadPricing([]);
    expect(r.degraded).toBe(true);
  });
});
describe('D60 — computeOptimalPrice', () => {
  it('正常', () => {
    const r = computeOptimalPrice([{ price: 100, quantity: 100 }, { price: 80, quantity: 200 }, { price: 60, quantity: 350 }], 40);
    expect(r.optimalPrice).toBeGreaterThan(0);
    expect(r.degraded).toBe(false);
  });
  it('降级: 需求点不足', () => {
    const r = computeOptimalPrice([{ price: 100, quantity: 100 }], 40);
    expect(r.degraded).toBe(true);
  });
});
describe('D60 — computeSurvivalMargin', () => {
  it('正常: 正生存边际', () => {
    const r = computeSurvivalMargin(10000, 4000, 3000);
    expect(r.isSurvivable).toBe(true);
    expect(r.degraded).toBe(false);
  });
  it('降级: 无收入', () => {
    const r = computeSurvivalMargin(0, 0, 0);
    expect(r.degraded).toBe(true);
  });
});
describe('D60 — computeScaleEconomy', () => {
  it('正常', () => {
    const r = computeScaleEconomy([{ volume: 100, avgCost: 50 }, { volume: 200, avgCost: 45 }, { volume: 500, avgCost: 42 }]);
    expect(r.returnsToScale).toBeTruthy();
    expect(r.degraded).toBe(false);
  });
  it('降级: 数据点不足', () => {
    const r = computeScaleEconomy([{ volume: 100, avgCost: 50 }]);
    expect(r.degraded).toBe(true);
  });
});
describe('D60 — computeCrossPriceElasticity', () => {
  it('正常', () => {
    const r = computeCrossPriceElasticity([{ name: 'A', price: 100, quantity: 1000, rivalPrice: 120, rivalQuantity: 900 }]);
    expect(r.avgCrossElasticity).toBeDefined();
    expect(r.degraded).toBe(false);
  });
  it('降级: 无数据', () => {
    const r = computeCrossPriceElasticity([]);
    expect(r.degraded).toBe(true);
  });
});
describe('D60 — computeMarketStructureDiagnosis', () => {
  it('正常: 寡头', () => { const r = computeMarketStructureDiagnosis(0.3, 4, 0.85); expect(r.structure).toBe('oligopoly'); expect(r.degraded).toBe(false); });
  it('降级', () => { const r = computeMarketStructureDiagnosis(-1, 0, 0); expect(r.degraded).toBe(true); });
});
describe('D60 — computeLernerIndex', () => {
  it('正常', () => { const r = computeLernerIndex(100, 50); expect(r.lernerIndex).toBe(0.5); expect(r.degraded).toBe(false); });
  it('降级', () => { const r = computeLernerIndex(0, 0); expect(r.degraded).toBe(true); });
});
describe('D60 — computeSynergy', () => {
  it('正常: 创造价值', () => { const r = computeSynergy(1000, 3000, 1500, 200); expect(r.isValueCreating).toBe(true); expect(r.degraded).toBe(false); });
  it('降级', () => { const r = computeSynergy(0, 0, 0, 0); expect(r.degraded).toBe(true); });
});
describe('D60 — computeIRR', () => {
  it('正常', () => { const r = computeIRR(10000, [3000, 4000, 5000, 3000]); expect(r.irr).toBeGreaterThan(0); expect(r.degraded).toBe(false); });
  it('降级', () => { const r = computeIRR(0, []); expect(r.degraded).toBe(true); });
});
describe('D60 — computeDisposalValue', () => {
  it('正常', () => { const r = computeDisposalValue([{ name: 'asset1', bookValue: 1000, marketValue: 1200, disposalCost: 50 }]); expect(r.netProceeds).toBeGreaterThan(0); expect(r.degraded).toBe(false); });
  it('降级', () => { const r = computeDisposalValue([]); expect(r.degraded).toBe(true); });
});
describe('D60 — computeDemandForecast', () => {
  it('正常', () => { const r = computeDemandForecast([100, 110, 120, 130, 140], 2); expect(r.forecast).toBeGreaterThan(140); expect(r.degraded).toBe(false); });
  it('降级', () => { const r = computeDemandForecast([100, 110]); expect(r.degraded).toBe(true); });
});
describe('D60 — computeConfidenceInterval', () => {
  it('正常', () => { const r = computeConfidenceInterval([95, 100, 105, 98, 102]); expect(r.mean).toBe(100); expect(r.degraded).toBe(false); });
  it('降级: 样本不足', () => { const r = computeConfidenceInterval([100]); expect(r.degraded).toBe(true); });
});
describe('D60 — computeStatisticalSignificance', () => {
  it('正常', () => { const r = computeStatisticalSignificance([100, 102, 98, 101, 99], [110, 115, 108, 112, 105]); expect(r.isSignificant).toBe(true); });
  it('降级: 样本不足', () => { const r = computeStatisticalSignificance([100], [110]); expect(r.degraded).toBe(true); });
});
describe('D60 — computeTimeSeriesDecomposition', () => {
  it('正常', () => { const r = computeTimeSeriesDecomposition([100, 110, 120, 130, 140, 150, 160, 170], 4); expect(r.forecast).toBeGreaterThan(0); expect(r.degraded).toBe(false); });
  it('降级: 序列太短', () => { const r = computeTimeSeriesDecomposition([100, 110], 4); expect(r.degraded).toBe(true); });
});
