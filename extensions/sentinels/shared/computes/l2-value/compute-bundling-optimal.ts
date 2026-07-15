/**
 * compute-bundling-optimal.ts — 捆绑销售优化 (Bundling)
 *
 * 契约ID: COMPUTE-BUNDLING-OPTIMAL-v1
 * 管理经济学(托马斯) Ch10 — 捆绑策略
 * @input products: Array<{name:string, standalonePrice:number, cost:number}>, bundleDiscount:number
 * @output { bundlePrice, standaloneTotal, bundleSavings, optimal }
 * @degraded products.length<2 -> degraded:true
 */
export interface BundlingInterpretation {
  bundlingStrategy: string;
  savingsRate: string;
  crossSellPotential: string;
}
export interface BundlingResult {
  bundlePrice: number; standaloneTotal: number; bundleSavings: number; optimal: boolean;
  economicInterpretation: BundlingInterpretation;
  degraded: boolean; warnings: string[];
}
export function computeBundlingOptimal(products: Array<{ name: string; standalonePrice: number; cost: number }>, bundleDiscount: number): BundlingResult {
  const w: string[] = [];
  if (products.length < 2 || bundleDiscount < 0 || bundleDiscount > 1) {
    return { bundlePrice: 0, standaloneTotal: 0, bundleSavings: 0, optimal: false,
      economicInterpretation: { bundlingStrategy: 'unknown', savingsRate: '0%', crossSellPotential: 'low' },
      degraded: true, warnings: ['Need >=2 products and discount 0-1'] };
  }
  const standaloneTotal = products.reduce((s, p) => s + p.standalonePrice, 0);
  const bundlePrice = standaloneTotal * (1 - bundleDiscount);
  const savings = standaloneTotal - bundlePrice;
  return {
    bundlePrice: Math.round(bundlePrice * 100) / 100,
    standaloneTotal: Math.round(standaloneTotal * 100) / 100,
    bundleSavings: Math.round(savings * 100) / 100,
    optimal: bundleDiscount > 0 && bundleDiscount < 0.5,
    economicInterpretation: {
      bundlingStrategy: bundleDiscount > 0.3 ? 'aggressive' : bundleDiscount > 0.1 ? 'moderate' : 'conservative',
      savingsRate: `${(bundleDiscount * 100).toFixed(0)}%`,
      crossSellPotential: products.length > 3 ? 'high' : 'moderate',
    }, degraded: false, warnings: w };
}
