/**
 * compute-customer-profitability.ts — 客户盈利能力计算
 *
 * 契约ID: COMPUTE-CUSTOMER-PROFITABILITY-v1
 * 模块: l2-value
 * 消费边: PRODUCES, FUNDS
 * 输入: revenue: number, cost: number, customerCount: number
 * 输出(正常): { value: number(单客户利润), confidence:'high', evidence:[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无数据'] }
 */
export function computeCustomerProfitability(revenue: number, cost: number, customerCount: number): {
  value: number;
  totalProfit: number;
  profitPerCustomer: number;
  profitMargin: number;
  confidence: 'high' | 'low';
  evidence: string[];
  degraded: boolean;
  warnings: string[];
  computedAt: string;
} {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();

  if (customerCount <= 0) {
    return { value: 0, totalProfit: 0, profitPerCustomer: 0, profitMargin: 0, confidence: 'low', evidence: [], degraded: true, warnings: ['客户数为0 — 无法计算', computedAt], computedAt };
  }

  const totalProfit = revenue - cost;
  const profitPerCustomer = totalProfit / customerCount;
  const profitMargin = revenue > 0 ? totalProfit / revenue : 0;

  const degraded = revenue === 0 && cost === 0;
  if (degraded) warnings.push('收入和成本均为0 — 结果可能不准确');

  return {
    value: Math.round(profitPerCustomer * 100) / 100,
    totalProfit: Math.round(totalProfit * 100) / 100,
    profitPerCustomer: Math.round(profitPerCustomer * 100) / 100,
    profitMargin: Math.round(profitMargin * 10000) / 10000,
    confidence: degraded ? 'low' : 'high',
    evidence: [`收入: ${revenue}`, `成本: ${cost}`, `客户数: ${customerCount}`],
    degraded,
    warnings,
    computedAt,
  };
}
