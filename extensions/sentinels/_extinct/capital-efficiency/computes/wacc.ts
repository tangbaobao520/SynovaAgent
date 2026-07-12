/**
 * wacc.ts — F3 哨兵 compute 函数
 *
 * WACC = (E/V) × re + (D/V) × rd × (1 - tax)
 * re = rf + β × (rm - rf)   (CAPM)
 *
 * 来源: Copeland, Koller & Murrin (McKinsey Valuation);
 *       公司理财(罗斯) Ch12 — 资本成本
 *
 * 本体映射: Financial::equity, totalDebt, taxRate
 * 外部参数: riskFree (rf), marketReturn (rm), beta (β)
 *
 * 降级: 无 equity/totalDebt 时使用行业默认值
 */
export interface WaccResult {
  wacc: number;
  costOfEquity: number;
  costOfDebt: number;
  equityWeight: number;
  debtWeight: number;
  degraded: boolean;
  warnings: string[];
}

export interface WaccParams {
  riskFree?: number;       // 无风险利率 (默认: 3% = 0.03)
  marketReturn?: number;   // 市场预期收益率 (默认: 10% = 0.10)
  beta?: number;           // 无杠杆β (默认: 1.0)
}

export function computeWacc(
  financials: Array<{ equity: number; totalDebt: number; taxRate: number }>,
  params?: WaccParams,
): WaccResult {
  const warnings: string[] = [];
  const rf = params?.riskFree ?? 0.03;
  const rm = params?.marketReturn ?? 0.10;
  const beta = params?.beta ?? 1.0;

  if (financials.length === 0) {
    return {
      wacc: 0,
      costOfEquity: 0,
      costOfDebt: 0,
      equityWeight: 0,
      debtWeight: 0,
      degraded: true,
      warnings: ['No financial data available'],
    };
  }

  // 聚合
  let totalEquity = 0;
  let totalDebt = 0;
  let totalTaxRate = 0;
  let countWithData = 0;

  for (const f of financials) {
    totalEquity += Math.max(0, f.equity);
    totalDebt += Math.max(0, f.totalDebt);
    if (f.taxRate > 0 && f.taxRate < 1) {
      totalTaxRate += f.taxRate;
      countWithData++;
    }
  }

  const taxRate = countWithData > 0 ? totalTaxRate / countWithData : 0.25; // 默认25%税率

  const totalCapital = totalEquity + totalDebt;

  if (totalCapital === 0) {
    return {
      wacc: 0,
      costOfEquity: 0,
      costOfDebt: 0,
      equityWeight: 0,
      debtWeight: 0,
      degraded: true,
      warnings: ['Total capital (equity + debt) is zero'],
    };
  }

  const equityWeight = totalEquity / totalCapital;
  const debtWeight = totalDebt / totalCapital;

  // CAPM: re = rf + β × (rm - rf)
  const costOfEquity = rf + beta * (rm - rf);

  // 债务成本: rd = rf + credit spread (简化: rf + 2% 假设)
  const creditSpread = totalDebt > totalEquity ? 0.03 : 0.02;
  const costOfDebt = rf + creditSpread;

  // WACC = E/V × re + D/V × rd × (1 - tax)
  const wacc = equityWeight * costOfEquity + debtWeight * costOfDebt * (1 - taxRate);

  const degraded = totalEquity === 0 || totalDebt === 0;
  if (degraded) {
    warnings.push('Partial capital data — WACC estimate may be unreliable');
  }

  return {
    wacc: Math.round(wacc * 10000) / 10000,
    costOfEquity: Math.round(costOfEquity * 10000) / 10000,
    costOfDebt: Math.round(costOfDebt * 10000) / 10000,
    equityWeight: Math.round(equityWeight * 100) / 100,
    debtWeight: Math.round(debtWeight * 100) / 100,
    degraded,
    warnings,
  };
}
