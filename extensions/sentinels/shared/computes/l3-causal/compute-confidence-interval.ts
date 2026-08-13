/**
 * compute-confidence-interval.ts — 置信区间 (Confidence Interval)
 *
 * 契约ID: COMPUTE-CONFIDENCE-INTERVAL-v1
 * 管理经济学 — 统计推断
 * @input sampleValues(number[]), confidenceLevel(0.9|0.95|0.99)
 * @output { mean, lowerBound, upperBound, marginOfError, sampleSize }
 * @degraded sampleValues.length<2 -> degraded:true
 */
export interface ConfidenceIntervalInterpretation { precision: string; reliability: string; businessImplication: string; }
export interface ConfidenceIntervalResult { mean: number; lowerBound: number; upperBound: number; marginOfError: number; sampleSize: number; economicInterpretation: ConfidenceIntervalInterpretation; degraded: boolean; warnings: string[]; }
export function computeConfidenceInterval(sampleValues: number[], confidenceLevel: 0.9 | 0.95 | 0.99 = 0.95): ConfidenceIntervalResult {
  const w: string[] = [];
  if (sampleValues.length < 2) return { mean: 0, lowerBound: 0, upperBound: 0, marginOfError: 0, sampleSize: 0,
    economicInterpretation: { precision: 'unknown', reliability: '样本不足', businessImplication: 'N/A' },
    degraded: true, warnings: ['Need >=2 samples'] };
  const mean = sampleValues.reduce((s, v) => s + v, 0) / sampleValues.length;
  const variance = sampleValues.reduce((s, v) => s + (v - mean) ** 2, 0) / (sampleValues.length - 1);
  const stdErr = Math.sqrt(variance / sampleValues.length);
  const zScore = confidenceLevel === 0.99 ? 2.576 : confidenceLevel === 0.95 ? 1.96 : 1.645;
  const moe = zScore * stdErr;
  return {
    mean: Math.round(mean * 100) / 100,
    lowerBound: Math.round((mean - moe) * 100) / 100,
    upperBound: Math.round((mean + moe) * 100) / 100,
    marginOfError: Math.round(moe * 100) / 100,
    sampleSize: sampleValues.length,
    economicInterpretation: {
      precision: moe / Math.abs(mean) < 0.1 ? '高精度' : moe / Math.abs(mean) < 0.3 ? '中等精度' : '低精度',
      reliability: sampleValues.length >= 30 ? '大样本可靠' : `小样本(n=${sampleValues.length})`,
      businessImplication: moe > Math.abs(mean) * 0.5 ? '误差过大，不宜用于决策' : '置信区间可用于决策参考',
    }, degraded: false, warnings: w };
}
