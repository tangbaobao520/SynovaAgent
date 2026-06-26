/**
 * capital-efficiency/computes/capital-turnover.ts — 资本周转率计算
 *
 * 资本周转率 = 营收 / 投入资本。反映单位资本产生的营收效率。
 * 纯函数：输入财务节点列表，输出周转率指标。
 */
export interface CapitalTurnoverResult {
  turnover: number;          // 营收/投入资本
  totalRevenue: number;
  totalCapital: number;
  degraded: boolean;
}

export function computeCapitalTurnover(financials: Array<{
  revenue: number;
  totalDebt?: number;
  equity?: number;
}>): CapitalTurnoverResult {
  if (financials.length === 0) {
    return { turnover: 0, totalRevenue: 0, totalCapital: 0, degraded: true };
  }

  const totalRevenue = financials.reduce((s, f) => s + f.revenue, 0);
  const totalCapital = financials.reduce((s, f) => s + (f.totalDebt || 0) + (f.equity || 0), 0);

  const turnover = totalCapital > 0 ? totalRevenue / totalCapital : (totalRevenue > 0 ? totalRevenue / 1 : 0);

  return { turnover, totalRevenue, totalCapital, degraded: totalRevenue === 0 };
}
