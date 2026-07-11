/**
 * compute-cross-functional-synergy.ts — 不同部门协同提升产出质量 (3.6)
 *
 * @contract COMPUTE-CROSS-FUNCTIONAL-SYNERGY-v1 CrossFunctionalSynergyInput {value,confidence,evidence,degraded,warnings} synergyCoefficient<0||coordinationEfficiency<0
 * 模块: l3-output/cross_functional_synergy
 * 消费边: CROSS_FUNCTIONAL_SYNERGY
 * 输入: synergyCoefficient(0-1), coordinationEfficiency(0-1)
 * 输出(正常): { value: synergy_coefficient × coordination_efficiency, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无协同数据'] }
 *
 * 算法: synergy_coefficient × coordination_efficiency
 */
export interface CrossFunctionalSynergyInput {
  synergyCoefficient: number;    // 协同系数(0-1), -1=未配置
  coordinationEfficiency: number; // 协调效率(0-1), -1=未配置
}

export function computeCrossFunctionalSynergy(input: CrossFunctionalSynergyInput) {
  const warnings: string[] = [];
  const { synergyCoefficient, coordinationEfficiency } = input;

  if (synergyCoefficient < 0 || coordinationEfficiency < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无协同数据 — synergyCoefficient或coordinationEfficiency未配置'],
    };
  }

  const clampedSynergy = Math.max(0, Math.min(1, synergyCoefficient));
  const clampedCoord = Math.max(0, Math.min(1, coordinationEfficiency));

  const value = Math.round(clampedSynergy * clampedCoord * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`synergyCoefficient: ${clampedSynergy}`, `coordinationEfficiency: ${clampedCoord}`],
    degraded: false,
    warnings,
  };
}
