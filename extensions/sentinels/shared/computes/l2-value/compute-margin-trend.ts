/**
 * compute-margin-trend.ts — 利润率趋势分解 (Margin Trend Decomposition)
 *
 * 契约ID: COMPUTE-MARGIN-TREND-v1
 * 管理经济学(托马斯) Ch4 — 利润率趋势分解
 *   将利润率变动分解为价格驱动 vs 成本驱动
 *
 * @input revenue: number, cost: number, history: Array<{revenue:number, cost:number, period:string}>
 * @output { decomposition, breakeven_cross_ref, trend_direction, economicInterpretation }
 * @degraded history.length < 2 -> degraded:true
 */
export interface MarginTrendInterpretation {
  /** 主驱动因素: price_driven / cost_driven / mixed */
  primaryDriver: string;
  /** 利润健康度: improving / stable / declining */
  profitHealth: string;
  /** 管理建议 */
  managementSuggestion: string;
}

export interface MarginTrendResult {
  /** 利润率分解: {priceDriven, costDriven, operatingLeverage} */
  decomposition: {
    /** 价格驱动的利润率变化百分比 */
    priceDriven: number;
    /** 成本驱动的利润率变化百分比 */
    costDriven: number;
    /** 经营杠杆贡献 */
    operatingLeverage: number;
  };
  /** 盈亏平衡交叉验证 */
  breakeven_cross_ref: {
    /** 当前盈亏平衡点（单位: 收入） */
    currentBreakeven: number;
    /** 趋势: expanding / contracting / stable */
    breakevenTrend: string;
    /** 安全边际率 */
    safetyMargin: number;
  };
  /** 趋势方向: improving / deteriorating / mixed / stable */
  trendDirection: string;
  /** 管理经济学语义解读 */
  economicInterpretation: MarginTrendInterpretation;
  degraded: boolean;
  warnings: string[];
}

/**
 * 分解利润率趋势。
 * 比较最近两期的 revenue/cost 数据，将利润率变化分解为价格和成本驱动因素。
 *
 * @param revenue — 当期收入
 * @param cost — 当期成本
 * @param history — 历史收支数据（至少2组）
 */
export function computeMarginTrend(
  revenue: number,
  cost: number,
  history: Array<{ revenue: number; cost: number; period: string }>,
): MarginTrendResult {
  const warnings: string[] = [];

  if (revenue <= 0) {
    return {
      decomposition: { priceDriven: 0, costDriven: 0, operatingLeverage: 0 },
      breakeven_cross_ref: { currentBreakeven: 0, breakevenTrend: 'unknown', safetyMargin: 0 },
      trendDirection: 'unknown',
      economicInterpretation: {
        primaryDriver: 'unknown',
        profitHealth: 'unknown',
        managementSuggestion: '收入为负或零，无法分析',
      },
      degraded: true,
      warnings: ['收入为 0'],
    };
  }

  const currentMargin = (revenue - cost) / revenue;
  const fixedCost = estimateFixedCost(history, revenue, cost);
  const contributionMargin = revenue - cost;
  const currentBreakeven = contributionMargin > 0 ? fixedCost / (contributionMargin / revenue) : Infinity;
  const safetyMargin = currentBreakeven !== Infinity && revenue > 0
    ? (revenue - currentBreakeven) / revenue
    : 0;

  if (history.length < 2) {
    return {
      decomposition: { priceDriven: 0, costDriven: 0, operatingLeverage: 0 },
      breakeven_cross_ref: {
        currentBreakeven: Math.round(currentBreakeven * 100) / 100,
        breakevenTrend: 'stable',
        safetyMargin: Math.round(safetyMargin * 10000) / 10000,
      },
      trendDirection: 'stable',
      economicInterpretation: {
        primaryDriver: 'unknown',
        profitHealth: currentMargin > 0.15 ? 'good' : currentMargin > 0.05 ? 'fair' : 'poor',
        managementSuggestion: '历史数据不足，仅当前利润率可用。建议积累更多周期的数据以便做趋势分解。',
      },
      degraded: true,
      warnings: ['数据不足，无法分解趋势'],
    };
  }

  // 取最近两期做比较
  const prev = history[history.length - 2];
  const prevMargin = prev.revenue > 0 ? (prev.revenue - prev.cost) / prev.revenue : 0;
  const marginChange = currentMargin - prevMargin;

  if (marginChange === 0) {
    return {
      decomposition: { priceDriven: 0, costDriven: 0, operatingLeverage: 0 },
      breakeven_cross_ref: {
        currentBreakeven: Math.round(currentBreakeven * 100) / 100,
        breakevenTrend: 'stable',
        safetyMargin: Math.round(safetyMargin * 10000) / 10000,
      },
      trendDirection: 'stable',
      economicInterpretation: {
        primaryDriver: 'stable',
        profitHealth: currentMargin > 0.15 ? 'good' : currentMargin > 0.05 ? 'fair' : 'poor',
        managementSuggestion: currentMargin > 0.15
          ? '利润率保持稳定且健康，持续监控即可'
          : '利润率稳定但偏低，建议审视成本结构',
      },
      degraded: false,
      warnings: [],
    };
  }

  // 分解: 价格驱动 = 收入变化带来的利润率变化（假设成本率不变）
  const prevCostRatio = prev.revenue > 0 ? prev.cost / prev.revenue : 0;
  const revenueEffect = prev.revenue > 0
    ? ((revenue - cost) / revenue) - ((prev.revenue - prev.cost) / prev.revenue)
    : 0;

  // 成本驱动 = 成本率变化带来的利润率变化
  const currentCostRatio = revenue > 0 ? cost / revenue : 0;
  const costEffect = prevCostRatio - currentCostRatio;

  const totalEffect = Math.abs(revenueEffect) + Math.abs(costEffect);
  const priceDrivenWeight = totalEffect > 0 ? Math.abs(revenueEffect) / totalEffect : 0.5;
  const costDrivenWeight = totalEffect > 0 ? Math.abs(costEffect) / totalEffect : 0.5;

  // 趋势方向
  let trendDirection: string;
  if (marginChange > 0.02) trendDirection = 'improving';
  else if (marginChange < -0.02) trendDirection = 'deteriorating';
  else if (Math.abs(marginChange) <= 0.02 && priceDrivenWeight > 0.6) trendDirection = 'mixed';
  else trendDirection = 'stable';

  // 盈亏平衡趋势
  const prevBreakeven = prev.revenue > 0 && (prev.revenue - prev.cost) > 0
    ? estimateFixedCost(history.slice(0, -1), prev.revenue, prev.cost) / ((prev.revenue - prev.cost) / prev.revenue)
    : currentBreakeven;
  const breakevenTrend = currentBreakeven < prevBreakeven * 0.95
    ? 'contracting'
    : currentBreakeven > prevBreakeven * 1.05
    ? 'expanding'
    : 'stable';

  // 经济解读
  const primaryDriver = priceDrivenWeight > 0.6 ? 'price_driven' : costDrivenWeight > 0.6 ? 'cost_driven' : 'mixed';
  const profitHealth = marginChange > 0 ? 'improving' : 'declining';
  const managementSuggestion = primaryDriver === 'price_driven'
    ? `利润率变化主要由价格驱动（占比${(priceDrivenWeight * 100).toFixed(0)}%）。建议审视定价策略和市场定位。`
    : primaryDriver === 'cost_driven'
    ? `利润率变化主要由成本驱动（占比${(costDrivenWeight * 100).toFixed(0)}%）。建议审查成本结构和供应链效率。`
    : '价格和成本因素共同影响利润率，建议同时优化定价和成本结构。';

  return {
    decomposition: {
      priceDriven: Math.round(priceDrivenWeight * 10000) / 10000,
      costDriven: Math.round(costDrivenWeight * 10000) / 10000,
      operatingLeverage: Math.round((contributionMargin / revenue) * 10000) / 10000,
    },
    breakeven_cross_ref: {
      currentBreakeven: Math.round(currentBreakeven * 100) / 100,
      breakevenTrend,
      safetyMargin: Math.round(safetyMargin * 10000) / 10000,
    },
    trendDirection,
    economicInterpretation: { primaryDriver, profitHealth, managementSuggestion },
    degraded: false,
    warnings,
  };
}

/** 估算固定成本（简化: 取历史成本的最小值作为固定成本近似） */
function estimateFixedCost(
  history: Array<{ revenue: number; cost: number; period?: string }>,
  _currentRevenue: number,
  _currentCost: number,
): number {
  if (history.length === 0) return 0;
  // 简化的固定成本估计: 当收入趋近0时成本的最小值 × 0.7
  const minCost = Math.min(...history.map((h) => h.cost));
  return Math.round(minCost * 0.7 * 100) / 100;
}
