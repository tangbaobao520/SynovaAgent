/**
 * compute-assumption-triggered-reallocation.ts — 假设被打破→触发资本配置阀关闭 (X.1)
 *
 * @contract COMPUTE-ASSUMPTION-TRIGGERED-REALLOCATION-v1 {AssumptionTriggeredReallocationInput} {value,confidence,evidence,degraded,warnings} {无假设数据 → degraded:true, warnings:['无假设数据 — assumptionBreachLevel或reallocationTriggerThreshold未配置']}
 * 模块: cross-cycle/assumption_triggered_reallocation
 * 消费边: ASSUMPTION_TRIGGERED_REALLOCATION
 * 输入: assumptionBreachLevel(0-1), reallocationTriggerThreshold(0-1)
 * 输出(正常): { value: assumptionBreachLevel ≥ threshold ? reallocationCheckSignal : 0, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无假设数据'] }
 *
 * 算法: assumptionBreachLevel ≥ threshold → breach_value × threshold_ratio, 否则 0
 */
export interface AssumptionTriggeredReallocationInput {
  assumptionBreachLevel: number;      // 假设违反程度(0-1), -1=未配置
  reallocationTriggerThreshold: number; // 触发阈值(0-1), -1=未配置
}

export function computeAssumptionTriggeredReallocation(input: AssumptionTriggeredReallocationInput) {
  const warnings: string[] = [];
  const { assumptionBreachLevel, reallocationTriggerThreshold } = input;

  if (assumptionBreachLevel < 0 || reallocationTriggerThreshold < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无假设数据 — assumptionBreachLevel或reallocationTriggerThreshold未配置'],
    };
  }

  const clampedBreach = Math.max(0, Math.min(1, assumptionBreachLevel));
  const clampedThreshold = Math.max(0, Math.min(1, reallocationTriggerThreshold));

  let value: number;
  if (clampedBreach >= clampedThreshold) {
    value = Math.round(clampedBreach * clampedThreshold * 1000) / 1000;
  } else {
    value = 0;
  }

  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`assumptionBreachLevel: ${clampedBreach}`, `reallocationTriggerThreshold: ${clampedThreshold}`, `thresholdMet: ${clampedBreach >= clampedThreshold}`],
    degraded: false,
    warnings,
  };
}
