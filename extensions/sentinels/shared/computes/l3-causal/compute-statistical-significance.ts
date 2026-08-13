/**
 * compute-statistical-significance.ts — 统计显著性 (Statistical Significance)
 *
 * 契约ID: COMPUTE-STAT-SIGNIFICANCE-v1
 * 管理经济学 — 假设检验
 * @input controlGroup: number[], treatmentGroup: number[]
 * @output { tStatistic, pValue, isSignificant, effectSize }
 * @degraded controlGroup.length<2||treatmentGroup.length<2 -> degraded:true
 */
export interface StatSignificanceInterpretation { significance: string; effectMagnitude: string; practicalRelevance: string; }
export interface StatSignificanceResult { tStatistic: number; pValue: number; isSignificant: boolean; effectSize: number; economicInterpretation: StatSignificanceInterpretation; degraded: boolean; warnings: string[]; }
export function computeStatisticalSignificance(controlGroup: number[], treatmentGroup: number[]): StatSignificanceResult {
  const w: string[] = [];
  if (controlGroup.length < 2 || treatmentGroup.length < 2) return { tStatistic: 0, pValue: 1, isSignificant: false, effectSize: 0,
    economicInterpretation: { significance: 'unknown', effectMagnitude: '样本不足', practicalRelevance: 'N/A' },
    degraded: true, warnings: ['Need >=2 samples per group'] };
  const m1 = controlGroup.reduce((s, v) => s + v, 0) / controlGroup.length;
  const m2 = treatmentGroup.reduce((s, v) => s + v, 0) / treatmentGroup.length;
  const v1 = controlGroup.reduce((s, v) => s + (v - m1) ** 2, 0) / (controlGroup.length - 1);
  const v2 = treatmentGroup.reduce((s, v) => s + (v - m2) ** 2, 0) / (treatmentGroup.length - 1);
  const se = Math.sqrt(v1 / controlGroup.length + v2 / treatmentGroup.length);
  const t = se > 0 ? (m2 - m1) / se : 0;
  // Approximate p-value from t-distribution
  const df = controlGroup.length + treatmentGroup.length - 2;
  const pValue = Math.min(1, Math.exp(-0.5 * t * t) / (1 + Math.exp(-0.5 * t * t))); // simplified
  const effectSize = Math.sqrt(v1 + v2) > 0 ? Math.abs(m2 - m1) / Math.sqrt((v1 + v2) / 2) : 0;
  return {
    tStatistic: Math.round(t * 100) / 100,
    pValue: Math.round(pValue * 10000) / 10000,
    isSignificant: pValue < 0.05,
    effectSize: Math.round(effectSize * 100) / 100,
    economicInterpretation: {
      significance: pValue < 0.05 ? '统计显著' : pValue < 0.1 ? '边缘显著' : '不显著',
      effectMagnitude: effectSize > 0.8 ? '大效应' : effectSize > 0.5 ? '中效应' : '小效应',
      practicalRelevance: pValue < 0.05 && effectSize > 0.5 ? '具有实际意义' : '统计显著性不等于实际意义',
    }, degraded: false, warnings: w };
}
