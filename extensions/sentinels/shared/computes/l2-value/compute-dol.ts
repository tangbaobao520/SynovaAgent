/**
 * compute-dol.ts — 经营杠杆系数 (Degree of Operating Leverage)
 *
 * 契约ID: COMPUTE-DOL-v1
 * 消费边: E-13/E-23
 * DOL = ContributionMargin / EBIT = (Sales - VariableCost) / (Sales - VariableCost - FixedCost)
 *
 * D59 ME Enhance: 追加 economic_interpretation 字段
 *   经营杠杆 > 3 = 高风险高弹性, 1.5-3 = 中等, < 1.5 = 低杠杆
 */

/** 管理经济学语义解读 */
export interface DOLInterpretation {
  /** 经营杠杆分类: high / medium / low */
  dolClassification: string;
  /** 方向放大效应 */
  directionAmplification: string;
  /** 风险等级 */
  riskLevel: string;
}

export interface DOLResult {
  dol: number;
  contributionMargin: number;
  ebit: number;
  fixedCostRatio: number;
  /** D59: 管理经济学语义解读 */
  economicInterpretation: DOLInterpretation;
  degraded: boolean;
  warnings: string[];
}

export function computeDOL(
  sales: number,
  variableCost: number,
  fixedCost: number,
): DOLResult {
  const warnings: string[] = [];
  const contributionMargin = sales - variableCost;
  const ebit = contributionMargin - fixedCost;

  if (ebit <= 0) {
    return {
      dol: Infinity,
      contributionMargin,
      ebit,
      fixedCostRatio: sales > 0 ? fixedCost / sales : 0,
      economicInterpretation: {
        dolClassification: 'high',
        directionAmplification: 'EBIT为负或零，经营杠杆无意义',
        riskLevel: 'critical',
      },
      degraded: true,
      warnings: ['EBIT is non-positive — DOL is undefined/infinite'],
    };
  }

  if (contributionMargin <= 0) {
    return {
      dol: 0,
      contributionMargin,
      ebit,
      fixedCostRatio: sales > 0 ? fixedCost / sales : 0,
      economicInterpretation: {
        dolClassification: 'low',
        directionAmplification: '边际贡献为负，收入无法覆盖变动成本',
        riskLevel: 'critical',
      },
      degraded: true,
      warnings: ['Contribution margin is non-positive'],
    };
  }

  const dol = contributionMargin / ebit;
  const fixedCostRatio = sales > 0 ? fixedCost / sales : 0;

  const dolClassification = dol > 3 ? 'high' : dol > 1.5 ? 'medium' : 'low';
  const directionAmplification = dol > 3
    ? '销售额±1% → EBIT±' + dol.toFixed(1) + '%，高杠杆放大了市场波动对利润的影响'
    : dol > 1.5
    ? '销售额±1% → EBIT±' + dol.toFixed(1) + '%，中等杠杆'
    : '销售额±1% → EBIT±' + dol.toFixed(1) + '%，低杠杆，利润相对稳定';
  const riskLevel = dol > 3 ? 'high' : dol > 1.5 ? 'medium' : 'low';

  return {
    dol: Math.round(dol * 100) / 100,
    contributionMargin: Math.round(contributionMargin * 100) / 100,
    ebit: Math.round(ebit * 100) / 100,
    fixedCostRatio: Math.round(fixedCostRatio * 10000) / 10000,
    economicInterpretation: { dolClassification, directionAmplification, riskLevel },
    degraded: false,
    warnings,
  };
}
