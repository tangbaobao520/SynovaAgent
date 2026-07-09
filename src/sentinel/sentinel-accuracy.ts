/**
 * sentinel-accuracy.ts — 哨兵精度基线计算模块
 *
 * T9: 建立哨兵精度计算框架，供 GA 标注数据积累后自动计算 precision/recall/f1。
 *
 * 契约（铁律47）:
 *   输入: sentinelId + AnnotationRecord[] → 输出: SentinelAccuracy
 *   降级: 标注 < 10 条时返回 degraded: true + warnings
 *
 * @module sentinel/sentinel-accuracy
 */

export interface AnnotationRecord {
  annotation: 'confirmed' | 'false_alarm' | 'uncertain' | 'correction';
}

export interface SentinelAccuracy {
  sentinelId: string;
  precision: number;
  recall: number;
  f1: number;
  uncertainRate: number;
  totalAnnotations: number;
  degraded: boolean;
  warnings: string[];
}

const MIN_ANNOTATIONS = 10;

export function computeSentinelAccuracy(
  sentinelId: string,
  annotations: AnnotationRecord[],
): SentinelAccuracy {
  const warnings: string[] = [];
  const totalAnnotations = annotations.length;

  if (totalAnnotations < MIN_ANNOTATIONS) {
    warnings.push(`标注数据不足（${totalAnnotations}条），至少需要${MIN_ANNOTATIONS}条才能计算有效精度。`);
    return { sentinelId, precision: 0, recall: 0, f1: 0, uncertainRate: 0, totalAnnotations, degraded: true, warnings };
  }

  let confirmed = 0, falseAlarm = 0, uncertain = 0, correction = 0;
  for (const ann of annotations) {
    switch (ann.annotation) {
      case 'confirmed': confirmed++; break;
      case 'false_alarm': falseAlarm++; break;
      case 'uncertain': uncertain++; break;
      case 'correction': correction++; break;
    }
  }

  const counted = confirmed + falseAlarm + uncertain + correction;
  if (counted !== totalAnnotations) {
    warnings.push(`标注分类计数（${counted}）与总数（${totalAnnotations}）不一致。`);
  }

  const precision = (confirmed + falseAlarm) > 0 ? confirmed / (confirmed + falseAlarm) : 1.0;
  const recall = (confirmed + correction) > 0 ? confirmed / (confirmed + correction) : 1.0;
  const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const uncertainRate = totalAnnotations > 0 ? uncertain / totalAnnotations : 0;

  if (precision < 0.5) warnings.push(`精确率偏低（${(precision * 100).toFixed(0)}%），哨兵误报过多。`);
  if (recall < 0.5) warnings.push(`召回率偏低（${(recall * 100).toFixed(0)}%），哨兵漏报过多。`);
  if (uncertainRate > 0.3) warnings.push(`不确定率偏高（${(uncertainRate * 100).toFixed(0)}%），哨兵阈值可能需要调整。`);
  if (correction >= confirmed && totalAnnotations > 0) warnings.push('修正标注数不低于确认数，哨兵可信度严重不足。');

  return {
    sentinelId,
    precision: Math.round(precision * 100) / 100,
    recall: Math.round(recall * 100) / 100,
    f1: Math.round(f1 * 100) / 100,
    uncertainRate: Math.round(uncertainRate * 100) / 100,
    totalAnnotations,
    degraded: false,
    warnings,
  };
}
