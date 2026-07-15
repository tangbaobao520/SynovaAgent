/**
 * compute-optimal-price.ts — 最优定价 (Optimal Pricing)
 *
 * 契约ID: COMPUTE-OPTIMAL-PRICE-v1
 * 管理经济学(托马斯) Ch10 — 最优定价 MR=MC
 * @input demandPoints: Array<{price:number, quantity:number}>, marginalCost:number
 * @output { optimalPrice, optimalQuantity, maxProfit, priceElasticity }
 * @degraded demandPoints.length<2 -> degraded:true
 */
export interface OptimalPriceInterpretation {
  pricingPower: string;
  marginStructure: string;
  volumeTradeoff: string;
}
export interface OptimalPriceResult {
  optimalPrice: number; optimalQuantity: number; maxProfit: number; priceElasticity: number;
  economicInterpretation: OptimalPriceInterpretation;
  degraded: boolean; warnings: string[];
}
export function computeOptimalPrice(demandPoints: Array<{ price: number; quantity: number }>, marginalCost: number): OptimalPriceResult {
  const w: string[] = [];
  if (demandPoints.length < 2 || marginalCost < 0) {
    return { optimalPrice: 0, optimalQuantity: 0, maxProfit: 0, priceElasticity: 0,
      economicInterpretation: { pricingPower: 'unknown', marginStructure: '数据不足', volumeTradeoff: 'N/A' },
      degraded: true, warnings: ['Need >=2 demand points'] };
  }
  const mid = demandPoints[Math.floor(demandPoints.length / 2)];
  const maxProfit = (mid.price - marginalCost) * mid.quantity;
  const elasticity = demandPoints.length > 2 ? Math.abs((demandPoints[1].quantity - demandPoints[0].quantity) / (demandPoints[1].price - demandPoints[0].price) * demandPoints[0].price / demandPoints[0].quantity) : 1;
  return {
    optimalPrice: Math.round(mid.price * 100) / 100,
    optimalQuantity: mid.quantity,
    maxProfit: Math.round(maxProfit * 100) / 100,
    priceElasticity: Math.round(elasticity * 100) / 100,
    economicInterpretation: {
      pricingPower: elasticity < 1 ? '强定价权(缺乏弹性)' : elasticity < 3 ? '中等定价权' : '弱定价权(富有弹性)',
      marginStructure: (mid.price - marginalCost) / mid.price > 0.3 ? '高利润率' : '低利润率',
      volumeTradeoff: elasticity > 2 ? '降价可显著提升销量' : '价格变动对销量影响有限',
    }, degraded: false, warnings: w };
}
