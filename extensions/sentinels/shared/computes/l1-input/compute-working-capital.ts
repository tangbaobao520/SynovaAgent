/**
 * compute-working-capital.ts — 营运资本分析 (Working Capital)
 *
 * 契约ID: COMPUTE-WORKING-CAPITAL-v1
 * 管理经济学(托马斯) Ch14 — 营运资本管理
 *   现金转换周期 + 流动性风险分层 + 营运资本比率
 *
 * @input currentAssets, currentLiabilities, inventory, receivables, payables, revenue, cogs
 * @output { cash_conversion_cycle, liquidity_risk_tier, working_capital_ratio, economicInterpretation }
 * @degraded revenue <= 0 || cogs <= 0 -> degraded:true
 */
export interface WorkingCapitalInterpretation {
  /** 营运资本效率: efficient / moderate / inefficient */
  efficiency: string;
  /** 流动性风险: low / moderate / high / critical */
  liquidityRisk: string;
  /** 改进建议 */
  improvementSuggestion: string;
}

export interface WorkingCapitalResult {
  /** 现金转换周期（天） */
  cashConversionCycle: number;
  /** 流动性风险分层 */
  liquidityRiskTier: string;
  /** 营运资本比率 */
  workingCapitalRatio: number;
  /** 管理经济学语义解读 */
  economicInterpretation: WorkingCapitalInterpretation;
  degraded: boolean;
  warnings: string[];
}

/**
 * 计算营运资本指标。
 *
 * @param currentAssets — 流动资产
 * @param currentLiabilities — 流动负债
 * @param inventory — 存货
 * @param receivables — 应收账款
 * @param payables — 应付账款
 * @param revenue — 年收入
 * @param cogs — 年销售成本
 */
export function computeWorkingCapital(
  currentAssets: number,
  currentLiabilities: number,
  inventory: number,
  receivables: number,
  payables: number,
  revenue: number,
  cogs: number,
): WorkingCapitalResult {
  const warnings: string[] = [];

  if (revenue <= 0 || cogs <= 0) {
    return {
      cashConversionCycle: 0,
      liquidityRiskTier: 'critical',
      workingCapitalRatio: 0,
      economicInterpretation: {
        efficiency: 'unknown',
        liquidityRisk: 'critical',
        improvementSuggestion: '收入或销售成本为负/零，无法计算营运资本指标',
      },
      degraded: true,
      warnings: ['收入或销售成本为 0'],
    };
  }

  // 现金转换周期 (CCC) = DIO + DSO - DPO
  const daysInInventory = cogs > 0 ? (inventory / cogs) * 365 : 0;
  const daysSalesOutstanding = revenue > 0 ? (receivables / revenue) * 365 : 0;
  const daysPayablesOutstanding = cogs > 0 ? (payables / cogs) * 365 : 0;
  const cashConversionCycle = Math.round((daysInInventory + daysSalesOutstanding - daysPayablesOutstanding) * 100) / 100;

  // 营运资本比率 = 流动资产 / 流动负债
  const workingCapitalRatio = currentLiabilities > 0
    ? Math.round((currentAssets / currentLiabilities) * 10000) / 10000
    : currentAssets > 0 ? Infinity : 0;

  // 流动性风险分层
  let liquidityRiskTier: string;
  if (workingCapitalRatio >= 2) liquidityRiskTier = 'low';
  else if (workingCapitalRatio >= 1.2) liquidityRiskTier = 'moderate';
  else if (workingCapitalRatio >= 0.8) liquidityRiskTier = 'high';
  else liquidityRiskTier = 'critical';

  // 经济解读
  let efficiency: string;
  if (cashConversionCycle < 0) {
    efficiency = 'efficient';
  } else if (cashConversionCycle < 45) {
    efficiency = 'efficient';
  } else if (cashConversionCycle < 90) {
    efficiency = 'moderate';
  } else {
    efficiency = 'inefficient';
  }

  const liquidityRisk = liquidityRiskTier === 'low' ? 'low' : liquidityRiskTier === 'moderate' ? 'moderate' : 'high';

  let improvementSuggestion: string;
  if (cashConversionCycle > 90) {
    improvementSuggestion = `现金转换周期过长（${cashConversionCycle}天），资金被运营占用太久。`
      + `建议: 加速应收账款回收（DSO=${Math.round(daysSalesOutstanding)}天），`
      + `优化库存管理（DIO=${Math.round(daysInInventory)}天），`
      + `延长应付账款账期（DPO=${Math.round(daysPayablesOutstanding)}天）。`;
  } else if (workingCapitalRatio < 1) {
    improvementSuggestion = `营运资本比率偏低（${workingCapitalRatio}），流动性风险较高。`
      + '建议: 增加流动资产或降低短期负债，确保短期偿债能力。';
  } else if (workingCapitalRatio > 3) {
    improvementSuggestion = `营运资本比率偏高（${workingCapitalRatio}），资金利用效率可能不足。`
      + '建议: 将多余流动性用于投资或偿还高息负债。';
  } else {
    improvementSuggestion = '营运资本结构合理，建议持续监控现金转换周期趋势。';
  }

  return {
    cashConversionCycle,
    liquidityRiskTier,
    workingCapitalRatio,
    economicInterpretation: { efficiency, liquidityRisk, improvementSuggestion },
    degraded: false,
    warnings,
  };
}
