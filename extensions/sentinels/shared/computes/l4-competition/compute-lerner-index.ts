/**
 * compute-lerner-index.ts — 勒纳指数 (Lerner Index)
 *
 * 契约ID: COMPUTE-LERNER-INDEX-v1
 * 管理经济学(托马斯) Ch7 — 市场势力
 * @input price(number), marginalCost(number)
 * @output { lernerIndex, marketPower, markupRate }
 * @degraded price<=0||marginalCost<0 -> degraded:true
 */
export interface LernerInterpretation { powerLevel: string; pricingStrategy: string; competitivePressure: string; }
export interface LernerResult { lernerIndex: number; marketPower: string; markupRate: number; economicInterpretation: LernerInterpretation; degraded: boolean; warnings: string[]; }
export function computeLernerIndex(price: number, marginalCost: number): LernerResult {
  const w: string[] = [];
  if (price <= 0 || marginalCost < 0) return { lernerIndex: 0, marketPower: 'unknown', markupRate: 0,
    economicInterpretation: { powerLevel: 'unknown', pricingStrategy: '数据无效', competitivePressure: 'N/A' },
    degraded: true, warnings: ['Invalid price/MC'] };
  const lerner = (price - marginalCost) / price;
  return {
    lernerIndex: Math.round(lerner * 10000) / 10000,
    marketPower: lerner > 0.5 ? 'strong' : lerner > 0.2 ? 'moderate' : 'weak',
    markupRate: Math.round((price / marginalCost) * 100) / 100,
    economicInterpretation: {
      powerLevel: lerner > 0.5 ? '强市场势力' : lerner > 0.2 ? '中等市场势力' : '弱市场势力',
      pricingStrategy: lerner > 0.5 ? '显著高于边际成本定价' : '接近边际成本定价',
      competitivePressure: lerner < 0.2 ? '市场竞争充分' : '存在进入壁垒',
    }, degraded: false, warnings: w };
}
