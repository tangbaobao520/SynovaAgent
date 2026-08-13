/**
 * compute-price-discrimination.ts — 价格歧视 (Price Discrimination)
 *
 * 契约ID: COMPUTE-PRICE-DISCRIMINATION-v1
 * 管理经济学(托马斯) Ch10 — 三级价格歧视
 * 数据源: GA customer segments
 * @input segments: Array<{price:number, quantity:number, cost:number}>
 * @output { optimalPrices, totalProfit, priceSpread, discriminationLevel }
 * @degraded segments.length<2 -> degraded:true
 */
export interface PriceDiscriminationInterpretation {
  discriminationLevel: string;
  segmentProfitability: string;
  fairnessConsideration: string;
}
export interface PriceDiscriminationResult {
  optimalPrices: number[];
  totalProfit: number;
  priceSpread: number;
  economicInterpretation: PriceDiscriminationInterpretation;
  degraded: boolean; warnings: string[];
}
export function computePriceDiscrimination(segments: Array<{ price: number; quantity: number; cost: number }>): PriceDiscriminationResult {
  const w: string[] = [];
  if (segments.length < 2) {
    return { optimalPrices: [], totalProfit: 0, priceSpread: 0,
      economicInterpretation: { discriminationLevel: 'none', segmentProfitability: '无分段数据', fairnessConsideration: 'N/A' },
      degraded: true, warnings: ['Need >=2 segments'] };
  }
  const prices = segments.map(s => s.price);
  const profit = segments.reduce((sum, s) => sum + (s.price - s.cost) * s.quantity, 0);
  const spread = Math.max(...prices) - Math.min(...prices);
  return {
    optimalPrices: prices.map(p => Math.round(p * 100) / 100),
    totalProfit: Math.round(profit * 100) / 100,
    priceSpread: Math.round(spread * 100) / 100,
    economicInterpretation: {
      discriminationLevel: spread > 50 ? 'third_degree' : spread > 10 ? 'second_degree' : 'first_degree',
      segmentProfitability: segments.filter(s => s.price > s.cost).length === segments.length ? 'all_profitable' : 'mixed',
      fairnessConsideration: spread > 50 ? '高价格差异可能引发公平性质疑' : '价格差异在合理范围',
    }, degraded: false, warnings: w };
}
