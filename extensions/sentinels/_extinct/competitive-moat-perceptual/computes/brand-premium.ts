export interface BrandPremiumResult { premium: number; ourPrice: number; avgMarketPrice: number; degraded: boolean; }
export function computeBrandPremium(products: Array<{ name: string; price: number; category: string }>): BrandPremiumResult {
  if (products.length === 0) return { premium: 0, ourPrice: 0, avgMarketPrice: 0, degraded: true };
  const pricesByCat: Record<string, number[]> = {};
  for (const p of products) {
    if (!pricesByCat[p.category]) pricesByCat[p.category] = [];
    pricesByCat[p.category].push(p.price);
  }
  let totalPremium = 0; let count = 0;
  for (const [cat, prices] of Object.entries(pricesByCat)) {
    if (prices.length < 2) continue;
    const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
    const max = Math.max(...prices);
    totalPremium += max > 0 ? (max - avg) / avg : 0;
    count++;
  }
  return { premium: count > 0 ? Math.round((totalPremium / count) * 100) / 100 : 0, ourPrice: Math.max(...products.map(p => p.price)), avgMarketPrice: products.reduce((s, p) => s + p.price, 0) / products.length, degraded: false };
}
