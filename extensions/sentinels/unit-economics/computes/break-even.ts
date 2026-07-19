/**
 * break-even.ts — I10 哨兵 compute 函数
 *
 * BEP (Break-Even Point) 盈亏平衡分析:
 * BEP_units = FixedCost / (Price - UnitVariableCost)
 * BEP_revenue = BEP_units × Price
 *
 * D59 ME Enhance: 追加 economic_interpretation 字段
 *
 * 来源: 管理经济学(托马斯) Ch6 — 盈亏平衡分析
 *
 * 本体映射: Financial(汇总) → 固定成本、单位价格、单位变动成本
 *
 * 契约:
 *   @input — fixedCost(number), price(number), unitVarCost(number), currentUnits?(number)
 *   @output — BreakEvenResult { breakEvenUnits, breakEvenRevenue, contributionMargin, safetyMargin, economicInterpretation }
 *   @degraded — fixedCost<=0||price<=0||unitVarCost<0 -> degraded:true + warnings
 */

/** 管理经济学语义解读 */
export interface BreakEvenInterpretation {
  /** BEP分类: far_below / near_threshold / above_current / unknown */
  bepClassification: string;
  /** 安全边际数值（含正负符号） */
  safetyMarginValue: number;
  /** 固定成本结构诊断: high_fixed / moderate / low_fixed */
  fixedCostStructure: string;
  /** 管理行动建议 */
  actionImplication: string;
}

export interface BreakEvenResult {
  breakEvenUnits: number;
  breakEvenRevenue: number;
  contributionMargin: number;
  currentUnits: number;
  isProfitable: boolean;
  safetyMargin: number;
  /** D59: 管理经济学语义解读 */
  economicInterpretation: BreakEvenInterpretation;
  degraded: boolean;
  warnings: string[];
}

function buildBreakEvenInterpretation(
  breakEvenUnits: number,
  currentUnits: number | undefined,
  contributionMargin: number,
  fixedCost: number,
): BreakEvenInterpretation {
  let bepClassification: string;
  let actionImplication: string;

  if (currentUnits !== undefined && currentUnits > 0 && isFinite(breakEvenUnits)) {
    const ratio = currentUnits / breakEvenUnits;
    if (ratio > 1.5) {
      bepClassification = 'far_below';
      actionImplication = '当前产量远高于盈亏平衡点，经营安全度高，可考虑产能扩张或价格策略调整';
    } else if (ratio > 1.0) {
      bepClassification = 'near_threshold';
      actionImplication = '当前产量略高于盈亏平衡点，需关注成本波动对盈利的影响';
    } else {
      bepClassification = 'above_current';
      actionImplication = '当前产量低于盈亏平衡点，需要提升产量或优化成本结构';
    }
  } else {
    bepClassification = 'unknown';
    actionImplication = '缺少产量数据，无法判断经营安全状态';
  }

  const beu = isFinite(breakEvenUnits) ? breakEvenUnits : Infinity;
  const fixedCostStructure = !isFinite(beu) ? 'high_fixed' :
    fixedCost > 0 && contributionMargin > 0 && (fixedCost / contributionMargin) > 10000 ? 'high_fixed' :
    fixedCost > 0 && contributionMargin > 0 && (fixedCost / contributionMargin) > 1000 ? 'moderate' : 'low_fixed';

  return {
    bepClassification,
    safetyMarginValue: currentUnits !== undefined && currentUnits > 0 && isFinite(breakEvenUnits)
      ? Math.round(((currentUnits - breakEvenUnits) / currentUnits) * 10000) / 10000 : 0,
    fixedCostStructure,
    actionImplication,
  };
}

export function computeBreakEven(
  fixedCost: number,
  price: number,
  unitVarCost: number,
  currentUnits?: number,
): BreakEvenResult {
  const warnings: string[] = [];

  if (fixedCost <= 0 && (price <= 0 || unitVarCost < 0)) {
    return {
      breakEvenUnits: 0,
      breakEvenRevenue: 0,
      contributionMargin: 0,
      currentUnits: currentUnits ?? 0,
      isProfitable: true,
      safetyMargin: 1,
      economicInterpretation: {
        bepClassification: 'unknown',
        safetyMarginValue: 0,
        fixedCostStructure: 'low_fixed',
        actionImplication: '输入数据无效（固定成本与价格均为零/负），无法进行盈亏平衡分析',
      },
      degraded: true,
      warnings: ['Invalid inputs: fixed cost and price/var cost both zero/negative'],
    };
  }

  const contributionMargin = price - unitVarCost;

  if (contributionMargin <= 0) {
    return {
      breakEvenUnits: Infinity,
      breakEvenRevenue: Infinity,
      contributionMargin: Math.round(contributionMargin * 100) / 100,
      currentUnits: currentUnits ?? 0,
      isProfitable: false,
      safetyMargin: -Infinity,
      economicInterpretation: {
        bepClassification: 'above_current',
        safetyMarginValue: -Infinity,
        fixedCostStructure: 'high_fixed',
        actionImplication: '边际贡献为负或零——价格无法覆盖变动成本，需立即调整定价或降低变动成本',
      },
      degraded: true,
      warnings: ['Contribution margin is non-positive — break-even is infinite'],
    };
  }

  const breakEvenUnits = fixedCost / contributionMargin;
  const breakEvenRevenue = breakEvenUnits * price;

  let isProfitable: boolean;
  let safetyMargin: number;

  if (currentUnits !== undefined && currentUnits > 0) {
    isProfitable = currentUnits > breakEvenUnits;
    safetyMargin = (currentUnits - breakEvenUnits) / currentUnits;
  } else {
    isProfitable = false;
    safetyMargin = 0;
    warnings.push('Current units not provided — profitability status unknown');
  }

  const economicInterpretation = buildBreakEvenInterpretation(breakEvenUnits, currentUnits, contributionMargin, fixedCost);

  return {
    breakEvenUnits: Math.round(breakEvenUnits * 100) / 100,
    breakEvenRevenue: Math.round(breakEvenRevenue * 100) / 100,
    contributionMargin: Math.round(contributionMargin * 100) / 100,
    currentUnits: currentUnits ?? 0,
    isProfitable,
    safetyMargin: Math.round(safetyMargin * 10000) / 10000,
    economicInterpretation,
    degraded: false,
    warnings,
  };
}
