/**
 * compute-peak-load-pricing.ts — 峰时定价 (Peak-Load Pricing)
 *
 * 契约ID: COMPUTE-PEAK-LOAD-PRICING-v1
 * 管理经济学(托马斯) Ch10 — 峰时负荷定价
 * @input periods: Array<{label:string, demand:number, capacity:number, marginalCost:number}>
 * @output { peakPrice, offPeakPrice, capacityUtilization, revenue }
 * @degraded periods.length===0 -> degraded:true
 */
export interface PeakLoadInterpretation {
  peakSpread: string;
  capacityConstraint: string;
  offPeakRecommendation: string;
}
export interface PeakLoadResult {
  peakPrice: number; offPeakPrice: number; capacityUtilization: number; totalRevenue: number;
  economicInterpretation: PeakLoadInterpretation;
  degraded: boolean; warnings: string[];
}
export function computePeakLoadPricing(periods: Array<{ label: string; demand: number; capacity: number; marginalCost: number }>): PeakLoadResult {
  const w: string[] = [];
  if (periods.length === 0) {
    return { peakPrice: 0, offPeakPrice: 0, capacityUtilization: 0, totalRevenue: 0,
      economicInterpretation: { peakSpread: 'unknown', capacityConstraint: '无数据', offPeakRecommendation: 'N/A' },
      degraded: true, warnings: ['No periods'] };
  }
  const peak = periods.reduce((max, p) => p.demand > max.demand ? p : max);
  const offPeak = periods.reduce((min, p) => p.demand < min.demand ? p : min);
  const utilization = periods.reduce((s, p) => s + p.demand / p.capacity, 0) / periods.length;
  const revenue = periods.reduce((s, p) => s + p.demand * p.marginalCost * 1.2, 0);
  const peakPrice = peak.marginalCost * (1 + (peak.demand - peak.capacity) / peak.capacity);
  return {
    peakPrice: Math.round(peakPrice * 100) / 100,
    offPeakPrice: Math.round(offPeak.marginalCost * 100) / 100,
    capacityUtilization: Math.round(utilization * 10000) / 10000,
    totalRevenue: Math.round(revenue * 100) / 100,
    economicInterpretation: {
      peakSpread: peakPrice > offPeak.marginalCost * 2 ? 'high' : 'moderate',
      capacityConstraint: peak.demand > peak.capacity ? 'capacity_bound' : 'demand_bound',
      offPeakRecommendation: offPeak.demand < peak.capacity * 0.3 ? '考虑低谷促销提升利用率' : '利用率均衡',
    }, degraded: false, warnings: w };
}
