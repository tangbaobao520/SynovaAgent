/**
 * compute-procurement-bargaining.ts — 采购时压低供应商价格 (4.5)
 *
 * @contract COMPUTE-PROCUREMENT-BARGAINING-v1 {ProcurementBargainingInput} {value,confidence,evidence,degraded,warnings} {无采购数据 → degraded:true, warnings:['无采购数据 — bargainingPower或costReductionRatio未配置']}
 * 模块: l4-capture/procurement_bargaining
 * 消费边: PROCUREMENT_BARGAINING
 * 输入: bargainingPower(0-1), costReductionRatio(0-1)
 * 输出(正常): { value: bargaining_power × cost_reduction_ratio, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无采购数据'] }
 *
 * 算法: bargaining_power × cost_reduction_ratio
 */
export interface ProcurementBargainingInput {
  bargainingPower: number;    // 议价能力(0-1), -1=未配置
  costReductionRatio: number; // 成本降低比(0-1), -1=未配置
}

export function computeProcurementBargaining(input: ProcurementBargainingInput) {
  const warnings: string[] = [];
  const { bargainingPower, costReductionRatio } = input;

  if (bargainingPower < 0 || costReductionRatio < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无采购数据 — bargainingPower或costReductionRatio未配置'],
    };
  }

  const clampedPower = Math.max(0, Math.min(1, bargainingPower));
  const clampedRatio = Math.max(0, Math.min(1, costReductionRatio));

  const value = Math.round(clampedPower * clampedRatio * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`bargainingPower: ${clampedPower}`, `costReductionRatio: ${clampedRatio}`],
    degraded: false,
    warnings,
  };
}
