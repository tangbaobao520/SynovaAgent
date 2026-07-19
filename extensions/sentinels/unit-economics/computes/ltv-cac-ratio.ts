/**
 * I10 单位经济可持续性: LTV/CAC 比率
 *
 * 理论依据: 客户生命周期价值 (LTV) 与获客成本 (CAC) 之比是
 * SaaS/订阅模式的核心效率指标。健康 LTV/CAC > 3，优秀 > 5。
 *
 * 评分方法:
 * - totalLTV: 所有客户生命周期价值之和
 * - totalCAC: 所有获客成本之和
 * - ltvCac = totalLTV / totalCAC, > 3 为健康
 *
 * 契约:
 *   @input — ltv(number), cac(number)
 *   @output — LtvCacResult { ratio, health, benchmark }
 *   @degraded — cac<=0 -> degraded:true + warnings
 */
export interface LtvCacResult {
  ltvCac: number;
  ltv: number;
  cac: number;
  degraded: boolean;
}

export function computeLtvCac(financials: Array<{ customerLifetimeValue: number; customerAcquisitionCost: number }>): LtvCacResult {
  if (financials.length === 0) return { ltvCac: 0, ltv: 0, cac: 0, degraded: true };
  const ltv = financials.reduce((s, f) => s + (f.customerLifetimeValue || 0), 0);
  const cac = financials.reduce((s, f) => s + (f.customerAcquisitionCost || 0), 0);
  return { ltvCac: cac > 0 ? Math.round((ltv / cac) * 100) / 100 : (ltv > 0 ? 99 : 0), ltv, cac, degraded: false };
}
