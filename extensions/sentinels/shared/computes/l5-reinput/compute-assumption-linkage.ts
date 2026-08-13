/**
 * compute-assumption-linkage.ts — 假设有效性与重配触发之间的关系 (E-42)
 *
 * @contract COMPUTE-ASSUMPTION-LINKAGE-v1 AssumptionLinkageInput {value,confidence,evidence,degraded,warnings} assumptionValidity<0
 * 模块: l5-reinput/assumption_linkage
 * 消费边: ASSUMPTION_LINKAGE
 * 输入: assumptionValidity(0-1), reallocationTrigger(0-1)
 * 输出(正常): { value: assumption_linkage_score, confidence, evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings }
 *
 * 算法: linkage_strength = assumption_validity × reallocation_trigger
 */
export interface AssumptionLinkageInput {
  assumptionValidity: number;     // 假设有效性(0-1), -1=未配置
  reallocationTrigger: number;    // 重配触发信号(0-1), -1=未配置
}

export function computeAssumptionLinkage(input: AssumptionLinkageInput) {
  const warnings: string[] = [];
  const { assumptionValidity, reallocationTrigger } = input;

  if (assumptionValidity < 0 || reallocationTrigger < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无假设数据 — assumptionValidity或reallocationTrigger未配置'],
    };
  }

  const clampedValidity = Math.max(0, Math.min(1, assumptionValidity));
  const clampedTrigger = Math.max(0, Math.min(1, reallocationTrigger));

  const value = Math.round(clampedValidity * clampedTrigger * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : value > 0.2 ? 'medium' as const : 'low' as const;

  return {
    value,
    confidence,
    evidence: [`assumptionValidity: ${clampedValidity}`, `reallocationTrigger: ${clampedTrigger}`],
    degraded: false,
    warnings,
  };
}
