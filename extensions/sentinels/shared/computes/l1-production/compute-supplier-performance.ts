/**
 * compute-supplier-performance.ts — 供应商绩效评分
 *
 * 契约ID: COMPUTE-SUPPLIER-PERFORMANCE-v1
 * 模块: l1-production
 * 消费边: SUBSTITUTES, PRODUCES
 * 输入: onTimeRate: number(0-1), qualityRate: number(0-1), costIndex: number
 * 输出(正常): { value: number(0-1综合评分), confidence:'high', evidence:[], degraded:false }
 */
export function computeSupplierPerformance(onTimeRate: number, qualityRate: number, costIndex: number): {
  value: number;
  components: { delivery: number; quality: number; cost: number };
  tier: 'A' | 'B' | 'C';
  confidence: 'high' | 'low';
  evidence: string[];
  degraded: boolean;
  warnings: string[];
  computedAt: string;
} {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();

  if (onTimeRate < 0 || qualityRate < 0 || costIndex < 0) {
    return { value: 0, components: { delivery: 0, quality: 0, cost: 0 }, tier: 'C', confidence: 'low', evidence: [], degraded: true, warnings: ['输入数据包含负数'], computedAt };
  }

  const delivery = Math.min(onTimeRate, 1);
  const quality = Math.min(qualityRate, 1);
  // costIndex: lower is better, normalized to 0-1
  const cost = costIndex > 0 ? Math.min(1 / costIndex, 1) : 1;

  const score = delivery * 0.4 + quality * 0.4 + cost * 0.2;
  const tier = score >= 0.8 ? 'A' : score >= 0.5 ? 'B' : 'C';

  const degraded = onTimeRate === 0 && qualityRate === 0;
  if (degraded) warnings.push('准时率和质量率均为0 — 请确认数据');

  return {
    value: Math.round(score * 10000) / 10000,
    components: { delivery: Math.round(delivery * 10000) / 10000, quality: Math.round(quality * 10000) / 10000, cost: Math.round(cost * 10000) / 10000 },
    tier,
    confidence: degraded ? 'low' : 'high',
    evidence: [`准时交付率: ${(onTimeRate * 100).toFixed(0)}%`, `质量合格率: ${(qualityRate * 100).toFixed(0)}%`],
    degraded,
    warnings,
    computedAt,
  };
}
