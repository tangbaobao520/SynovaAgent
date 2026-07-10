/**
 * compute-profit-reinvestment.ts — 利润再投资 (5.1)
 *
 * 契约ID: COMPUTE-PROFIT-REINVESTMENT-v1
 * 模块: l5-reinput/profit_reinvestment
 * 消费边: PROFIT_REINVESTMENT
 * 输入: reinvestmentRatio(0-1), profitGrowth(0-1)
 * 输出(正常): { value: reinvestment_ratio × profit_growth, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无利润数据'] }
 *
 * 算法: reinvestment_ratio × profit_growth
 */
export interface ProfitReinvestmentInput {
  reinvestmentRatio: number; // 再投资比例(0-1), -1=未配置
  profitGrowth: number;      // 利润增长率(0-1), -1=未配置
}

export function computeProfitReinvestment(input: ProfitReinvestmentInput) {
  const warnings: string[] = [];
  const { reinvestmentRatio, profitGrowth } = input;

  if (reinvestmentRatio < 0 || profitGrowth < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无利润数据 — reinvestmentRatio或profitGrowth未配置'],
    };
  }

  const clampedRatio = Math.max(0, Math.min(1, reinvestmentRatio));
  const clampedGrowth = Math.max(0, Math.min(1, profitGrowth));

  const value = Math.round(clampedRatio * clampedGrowth * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`reinvestmentRatio: ${clampedRatio}`, `profitGrowth: ${clampedGrowth}`],
    degraded: false,
    warnings,
  };
}
