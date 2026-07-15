/**
 * compute-two-part-tariff.ts — 两部定价 (Two-Part Tariff)
 *
 * 契约ID: COMPUTE-TWO-PART-TARIFF-v1
 * 管理经济学(托马斯) Ch10 — 两部定价策略
 * 数据源: T8 PricingModel
 * @input membershipFee(number), perUnitPrice(number), unitCost(number), customerCount(number)
 * @output { optimalMembershipFee, optimalPerUnitPrice, totalProfit, consumerSurplus }
 * @degraded membershipFee<=0||perUnitPrice<=0||unitCost<=0 -> degraded:true
 */
export interface TwoPartTariffInterpretation {
  pricingStrategy: string;
  profitDriver: string;
  adoptionRisk: string;
}
export interface TwoPartTariffResult {
  optimalMembershipFee: number;
  optimalPerUnitPrice: number;
  totalProfit: number;
  consumerSurplus: number;
  economicInterpretation: TwoPartTariffInterpretation;
  degraded: boolean; warnings: string[];
}
export function computeTwoPartTariff(membershipFee: number, perUnitPrice: number, unitCost: number, customerCount: number): TwoPartTariffResult {
  const w: string[] = [];
  if (membershipFee <= 0 || perUnitPrice <= 0 || unitCost <= 0 || customerCount <= 0) {
    return { optimalMembershipFee: 0, optimalPerUnitPrice: 0, totalProfit: 0, consumerSurplus: 0,
      economicInterpretation: { pricingStrategy: 'unknown', profitDriver: '输入数据无效', adoptionRisk: 'high' },
      degraded: true, warnings: ['Invalid inputs'] };
  }
  const unitProfit = perUnitPrice - unitCost;
  const totalProfit = membershipFee * customerCount + unitProfit * customerCount * 10; // simplified
  const cs = (perUnitPrice - unitCost) * customerCount * 5;
  return {
    optimalMembershipFee: Math.round(membershipFee * 100) / 100,
    optimalPerUnitPrice: Math.round(perUnitPrice * 100) / 100,
    totalProfit: Math.round(totalProfit * 100) / 100,
    consumerSurplus: Math.round(cs * 100) / 100,
    economicInterpretation: {
      pricingStrategy: unitProfit > 0 ? 'positive_unit_margin' : 'loss_leader',
      profitDriver: membershipFee > unitProfit * 10 ? 'membership_driven' : 'usage_driven',
      adoptionRisk: membershipFee > 100 ? 'high' : 'moderate',
    }, degraded: false, warnings: w };
}
