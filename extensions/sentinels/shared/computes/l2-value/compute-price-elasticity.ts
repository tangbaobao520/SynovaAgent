/**
 * compute-price-elasticity.ts — 价格弹性 (Price Elasticity)
 *
 * 契约ID: COMPUTE-PRICE-ELASTICITY-v1
 * 管理经济学(托马斯) Ch4 — 需求价格弹性
 *   弹性 = (ΔQ/Q) / (ΔP/P)
 *
 * @input price: number, quantity: number, priceHistory: Array<{price:number, quantity:number}>
 * @output { elasticity, r_squared, residual_analysis, multicollinearity_warning, confidence_interval, economicInterpretation }
 * @degraded priceHistory.length < 2 -> degraded:true
 */
export interface PriceElasticityInterpretation {
  /** 弹性分类: elastic(>1) / unit_elastic(=1) / inelastic(<1) */
  elasticityType: string;
  /** 定价策略建议 */
  pricingImplication: string;
  /** 收入影响评估 */
  revenueImpact: string;
}

export interface PriceElasticityResult {
  /** 价格弹性系数（绝对值） */
  elasticity: number;
  /** 回归拟合优度 0-1 */
  r_squared: number;
  /** 残差分析: 是否存在异方差或自相关 */
  residual_analysis: string;
  /** 多重共线性警告（需要更多自变量时） */
  multicollinearity_warning: string;
  /** 置信区间 [下限, 上限] */
  confidence_interval: [number, number];
  /** 管理经济学语义解读 */
  economicInterpretation: PriceElasticityInterpretation;
  degraded: boolean;
  warnings: string[];
}

/**
 * 计算价格弹性。
 * 使用线性回归: ln(Q) = a + b*ln(P)，弹性 = |b|
 *
 * @param price — 当前价格
 * @param quantity — 当前数量
 * @param priceHistory — 历史价格-数量对（至少2组）
 */
export function computePriceElasticity(
  price: number,
  quantity: number,
  priceHistory: Array<{ price: number; quantity: number }>,
): PriceElasticityResult {
  const warnings: string[] = [];

  if (price <= 0 || quantity <= 0) {
    return {
      elasticity: 0,
      r_squared: 0,
      residual_analysis: 'N/A',
      multicollinearity_warning: 'N/A',
      confidence_interval: [0, 0],
      economicInterpretation: {
        elasticityType: 'unknown',
        pricingImplication: '价格或数量为负/零，无法计算弹性',
        revenueImpact: 'N/A',
      },
      degraded: true,
      warnings: ['价格或数量为 0'],
    };
  }

  if (priceHistory.length < 2) {
    return {
      elasticity: 0,
      r_squared: 1,
      residual_analysis: '仅一组数据，无法做回归分析',
      multicollinearity_warning: '数据不足无法检测多重共线性',
      confidence_interval: [0, 0],
      economicInterpretation: {
        elasticityType: 'unknown',
        pricingImplication: '数据不足，无法估算弹性',
        revenueImpact: 'N/A',
      },
      degraded: true,
      warnings: ['数据不足，弹性估算不精确'],
    };
  }

  // 对数线性回归: ln(Q) = a + b*ln(P)
  const n = priceHistory.length;
  const lnP = priceHistory.map((d) => Math.log(d.price));
  const lnQ = priceHistory.map((d) => Math.log(d.quantity));

  const meanLnP = lnP.reduce((a, b) => a + b, 0) / n;
  const meanLnQ = lnQ.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denom = 0;
  for (let i = 0; i < n; i++) {
    num += (lnP[i] - meanLnP) * (lnQ[i] - meanLnQ);
    denom += (lnP[i] - meanLnP) ** 2;
  }

  if (denom === 0) {
    return {
      elasticity: 1,
      r_squared: 0,
      residual_analysis: '价格无变化，无法计算弹性',
      multicollinearity_warning: 'N/A',
      confidence_interval: [0.5, 1.5],
      economicInterpretation: {
        elasticityType: 'unit_elastic',
        pricingImplication: '价格无波动，无法估算弹性',
        revenueImpact: 'N/A',
      },
      degraded: true,
      warnings: ['价格无变化，弹性系数设为 1'],
    };
  }

  const b = num / denom; // ln(Q) 对 ln(P) 的斜率 = 弹性
  const a = meanLnQ - b * meanLnP;
  const elasticity = Math.abs(Math.round(b * 10000) / 10000);

  // R-squared
  const ssRes = lnQ.reduce((s, q, i) => {
    const predicted = a + b * lnP[i];
    return s + (q - predicted) ** 2;
  }, 0);
  const ssTot = lnQ.reduce((s, q) => s + (q - meanLnQ) ** 2, 0);
  const r_squared = ssTot > 0 ? Math.round((1 - ssRes / ssTot) * 10000) / 10000 : 0;

  // 残差分析
  const residuals = lnQ.map((q, i) => q - (a + b * lnP[i]));
  const hasHeteroskedasticity = Math.abs(residuals[residuals.length - 1]) > Math.abs(residuals[0]) * 2;
  const residual_analysis = hasHeteroskedasticity
    ? '可能存在异方差（末端残差扩大）'
    : '残差分布基本均匀，无异方差明显迹象';

  // 多重共线性警告（仅当有多个自变量时才有意义，此处为数据量提示）
  const multicollinearity_warning = n < 10
    ? `样本量较小（n=${n}），弹性估算置信度有限`
    : '样本量充足';

  // 置信区间（简化: ±1.96 * stdErr）
  const mse = n > 2 ? ssRes / (n - 2) : 0;
  const stdErr = denom > 0 ? Math.sqrt(mse / denom) : 0;
  const ciHalfWidth = 1.96 * stdErr;
  const ciLower = Math.max(0, Math.round((elasticity - ciHalfWidth) * 10000) / 10000);
  const ciUpper = Math.round((elasticity + ciHalfWidth) * 10000) / 10000;

  // 经济解读
  const elasticityType = elasticity > 1 ? 'elastic' : elasticity < 1 ? 'inelastic' : 'unit_elastic';
  const pricingImplication = elasticityType === 'elastic'
    ? '降价可显著提升销量，但需评估成本结构——降价的单位利润损失是否被销量增长覆盖'
    : elasticityType === 'inelastic'
    ? '提价空间存在——客户对价格不敏感，提价可直接改善利润率'
    : '单位弹性——价格变动与需求量同比变动';
  const revenueImpact = elasticityType === 'elastic'
    ? `弹性=${elasticity}: 降价10% → 销量增~${(elasticity * 10).toFixed(1)}% → 收入趋增`
    : `弹性=${elasticity}: 提价10% → 销量降~${(elasticity * 10).toFixed(1)}% → 收入趋增`;

  return {
    elasticity,
    r_squared,
    residual_analysis,
    multicollinearity_warning,
    confidence_interval: [ciLower, ciUpper] as [number, number],
    economicInterpretation: { elasticityType, pricingImplication, revenueImpact },
    degraded: false,
    warnings,
  };
}
