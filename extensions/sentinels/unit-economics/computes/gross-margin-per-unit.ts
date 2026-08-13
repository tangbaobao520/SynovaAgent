/**
 * I10 单位经济可持续性: 单位毛利率
 *
 * 理论依据: 单位经济学是 SaaS/订阅模式健康度的核心指标。
 * 单位毛利率 = (单位收入 - 单位成本) / 单位收入，反映
 * 每个客户的服务交付效率和定价能力。
 *
 * 评分方法:
 * - unitMargin = (unitRevenue - unitCost) / unitRevenue
 * - margin ∈ [0,1], 越高越健康
 *
 * 契约:
 *   @input — price(number), unitCost(number)
 *   @output — GrossMarginResult { grossMargin, marginRatio, benchmark }
 *   @degraded — price<=0||unitCost<0 -> degraded:true + warnings
 */
export interface UnitMarginResult {
  margin: number;
  unitRevenue: number;
  unitCost: number;
  degraded: boolean;
}

export function computeUnitMargin(financials: Array<{ unitRevenue: number; unitCost: number }>): UnitMarginResult {
  if (financials.length === 0) return { margin: 0, unitRevenue: 0, unitCost: 0, degraded: true };
  const rev = financials.reduce((s, f) => s + (f.unitRevenue || 0), 0);
  const cost = financials.reduce((s, f) => s + (f.unitCost || 0), 0);
  return { margin: rev > 0 ? Math.round(((rev - cost) / rev) * 100) / 100 : 0, unitRevenue: rev, unitCost: cost, degraded: false };
}
