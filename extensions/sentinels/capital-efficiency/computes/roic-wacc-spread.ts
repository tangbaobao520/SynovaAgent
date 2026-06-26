/**
 * capital-efficiency/computes/roic-wacc-spread.ts — ROIC/WACC 差距计算
 *
 * ROIC = NOPAT / Invested Capital (简化版用营收利润率近似)
 * WACC = 资本成本 (从 FINANCIAL 节点读取或使用默认行业值)
 * Spread = ROIC - WACC > 0 → 价值创造
 *
 * 纯函数：输入财务节点列表，输出价差指标。
 */
export interface RoicWaccResult {
  spread: number;           // ROIC - WACC
  roic: number;
  wacc: number;
  degraded: boolean;
  warnings: string[];
}

export interface FinancialRecord {
  revenue: number;
  cost: number;
  operatingExpenses: number;
  totalDebt?: number;
  equity?: number;
  waccOverride?: number;
}

export function computeRoicWaccSpread(financials: FinancialRecord[]): RoicWaccResult {
  if (financials.length === 0) {
    return { spread: 0, roic: 0, wacc: 0, degraded: true, warnings: ['无财务数据'] };
  }

  const totalRev = financials.reduce((s, f) => s + f.revenue, 0);
  const totalCost = financials.reduce((s, f) => s + f.cost + (f.operatingExpenses || 0), 0);
  const totalCapital = financials.reduce((s, f) => s + (f.totalDebt || 0) + (f.equity || 0), 0);

  const nopat = totalRev - totalCost;  // 简化: NOPAT ≈ 总收入 - 总成本
  const roic = totalCapital > 0 ? nopat / totalCapital : (totalRev > 0 ? nopat / totalRev : 0);

  // WACC: 优先使用用户提供的覆盖值，否则默认 10%
  const waccInput = financials.find(f => f.waccOverride !== undefined)?.waccOverride;
  const wacc = waccInput !== undefined ? waccInput : 0.10;
  const spread = roic - wacc;

  const warnings: string[] = [];
  if (totalCapital === 0) warnings.push('无债务/权益数据，ROIC 使用营收近似');
  if (waccInput === undefined) warnings.push('WACC 使用默认值 10%');

  return { spread, roic, wacc, degraded: totalRev === 0, warnings };
}
