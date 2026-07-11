/**
 * compute-data-collection.ts — 采集内部经营信息 (1.5)
 *
 * @contract COMPUTE-DATA-COLLECTION-v1 DataCollectionInput {value,confidence,evidence,degraded,warnings} collectionCoverage<0
 * 模块: l1-input/data_collection
 * 消费边: DATA_COLLECTION
 * 输入: collectionCoverage(0-1), dataQuality(0-1), collectionFrequencyDays(number)
 * 输出(正常): { value: 数据采集健康度, confidence, evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无数据源'] }
 *
 * 算法: health = coverage × quality × frequency_factor
 * frequency_factor = 1 - exp(-30/frequency_days)
 */
export interface DataCollectionInput {
  collectionCoverage: number;       // 采集覆盖率(0-1), -1=未配置
  dataQuality: number;              // 数据质量(0-1)
  collectionFrequencyDays: number;  // 采集周期(天), 0=一次性
}

export function computeDataCollection(input: DataCollectionInput) {
  const warnings: string[] = [];
  const { collectionCoverage, dataQuality, collectionFrequencyDays } = input;

  if (collectionCoverage < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无数据源 — collectionCoverage未配置'],
    };
  }

  const clampedCoverage = Math.max(0, Math.min(1, collectionCoverage));
  const clampedQuality = Math.max(0, Math.min(1, dataQuality));
  const freqDays = Math.max(1, collectionFrequencyDays);

  const frequencyFactor = 1 - Math.exp(-30 / freqDays);
  const health = clampedCoverage * clampedQuality * frequencyFactor;
  const value = Math.round(health * 1000) / 1000;
  const confidence = clampedCoverage > 0.8 && clampedQuality > 0.8 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`coverage: ${clampedCoverage}`, `quality: ${clampedQuality}`, `freqDays: ${freqDays}`],
    degraded: false,
    warnings,
  };
}
