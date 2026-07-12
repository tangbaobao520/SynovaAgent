/**
 * SLM 公式 (Helmer 2016): SLM = Om x (OP/NP) x delta
 * - Om: 竞争者旧业务利润率
 * - OP/NP: 竞争者价格 / 我方价格
 * - delta: 蚕食率
 */
export interface SlmResult { applicable: boolean; slm: number; conditions: Record<string, boolean>; confidence: number; degraded: boolean; }
export function computeCounterPositioningSlm(params: { incumbentMargin: number; incumbentPrice: number; ourPrice: number; ourRevenue: number; incumbentRevenue: number }): SlmResult {
  const { incumbentMargin, incumbentPrice, ourPrice, ourRevenue, incumbentRevenue } = params;
  if (incumbentRevenue === 0 || ourPrice === 0) return { applicable: false, slm: 0, conditions: { profitExposure: false, modelConflict: false, sizeAsymmetry: false, windowOpen: false }, confidence: 0, degraded: true };
  const profitExposure = incumbentMargin > 0.5;
  const sizeAsymmetry = incumbentRevenue > 0 && ourRevenue / incumbentRevenue < 0.05;
  const priceRatio = ourPrice > 0 ? incumbentPrice / ourPrice : 1;
  const delta = priceRatio > 1.5 ? 0.8 : (priceRatio > 1 ? 0.5 : 0.2);
  const conditions = { profitExposure, modelConflict: true, sizeAsymmetry, windowOpen: true };
  if (!profitExposure || !sizeAsymmetry) return { applicable: false, slm: 0, conditions, confidence: 0.3, degraded: false };
  const slm = incumbentMargin * priceRatio * delta;
  return { applicable: true, slm: Math.round(slm * 100) / 100, conditions, confidence: delta > 0.5 ? 0.7 : 0.4, degraded: false };
}
