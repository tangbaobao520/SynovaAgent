/**
 * break-even.ts — I10 哨兵 compute 函数
 *
 * BEP (Break-Even Point) 盈亏平衡分析:
 * BEP_units = FixedCost / (Price - UnitVariableCost)
 * BEP_revenue = BEP_units × Price
 *
 * 来源: 管理经济学(托马斯) Ch6 — 盈亏平衡分析
 *
 * 本体映射: Financial(汇总) → 固定成本、单位价格、单位变动成本
 */
export interface BreakEvenResult {
  breakEvenUnits: number;
  breakEvenRevenue: number;
  contributionMargin: number;
  currentUnits: number;
  isProfitable: boolean;
  safetyMargin: number; // (currentUnits - BEP) / currentUnits
  degraded: boolean;
  warnings: string[];
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

  return {
    breakEvenUnits: Math.round(breakEvenUnits * 100) / 100,
    breakEvenRevenue: Math.round(breakEvenRevenue * 100) / 100,
    contributionMargin: Math.round(contributionMargin * 100) / 100,
    currentUnits: currentUnits ?? 0,
    isProfitable,
    safetyMargin: Math.round(safetyMargin * 10000) / 10000,
    degraded: false,
    warnings,
  };
}
