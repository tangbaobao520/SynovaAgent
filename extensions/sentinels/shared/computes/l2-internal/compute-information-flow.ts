/**
 * compute-information-flow.ts — 让信息流到需要的人手里 (2.4)
 *
 * @contract COMPUTE-INFORMATION-FLOW-v1 InformationFlowInput {value,confidence,evidence,degraded,warnings} filteringLoss<0||nLayers<0
 * 模块: l2-internal/information_flow
 * 消费边: INFORMATION_FLOW
 * 输入: filteringLoss(0-1), nLayers(正整数)
 * 输出(正常): { value: 1 - filtering_loss^n_layers, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无层级数据—nLayers未配置'] }
 *
 * 算法: 1 - filtering_loss^n_layers
 */
export interface InformationFlowInput {
  filteringLoss: number;  // 每层过滤损耗(0-1), -1=未配置
  nLayers: number;        // 管理层级数(≥0), -1=未配置
}

export function computeInformationFlow(input: InformationFlowInput) {
  const warnings: string[] = [];
  const { filteringLoss, nLayers } = input;

  if (filteringLoss < 0 || nLayers < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无层级数据 — filteringLoss或nLayers未配置'],
    };
  }

  if (nLayers === 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: ['nLayers: 0'],
      degraded: true, warnings: ['nLayers为0 — 不存在层级传递'],
    };
  }

  const clampedLoss = Math.max(0, Math.min(1, filteringLoss));
  const value = Math.round((1 - Math.pow(clampedLoss, nLayers)) * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`filteringLoss: ${clampedLoss}`, `nLayers: ${nLayers}`, `cascadedFidelity: ${value.toFixed(3)}`],
    degraded: false,
    warnings,
  };
}
