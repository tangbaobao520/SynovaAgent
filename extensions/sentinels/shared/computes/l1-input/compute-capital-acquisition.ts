/**
 * compute-capital-acquisition.ts — 获取资本 (1.1)
 *
 * 契约ID: COMPUTE-CAPITAL-ACQUISITION-v1
 * 模块: l1-input/capital_acquisition
 * 消费边: CAPITAL_ACQUISITION
 * 输入: capitalRaised(number), costOfCapital(number), targetCapital(number)
 * 输出(正常): { value: 资本获取效率, confidence, evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['目标融资额为0'] }
 *
 * 算法: capital_inflow_ratio = capital_raised / target_capital
 * 资本效率 = inflow_ratio × (1 - min(cost_of_capital / max_cost, 1))
 */
export interface CapitalAcquisitionInput {
  capitalRaised: number;   // 实际融资额
  costOfCapital: number;   // 资本成本率(百分比)
  targetCapital: number;   // 目标融资额
}

export function computeCapitalAcquisition(input: CapitalAcquisitionInput) {
  const warnings: string[] = [];
  const { capitalRaised, costOfCapital, targetCapital } = input;

  if (targetCapital <= 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['目标融资额targetCapital<=0 — 无法计算资本获取效率'],
    };
  }

  const inflowRatio = Math.min(2, Math.max(0, capitalRaised / targetCapital));
  const costPenalty = Math.min(1, Math.max(0, costOfCapital / 100));
  const efficiency = inflowRatio * (1 - costPenalty);
  const value = Math.round(efficiency * 1000) / 1000;
  const confidence = inflowRatio >= 1 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`capitalRaised: ${capitalRaised}`, `costOfCapital: ${costOfCapital}%`, `target: ${targetCapital}`],
    degraded: false,
    warnings,
  };
}
