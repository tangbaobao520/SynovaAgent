/**
 * compute-efficiency-financing.ts — 效率信号与融资效率的关系 (E-12)
 *
 * @contract COMPUTE-EFFICIENCY-FINANCING-v1 EfficiencyFinancingInput {value,confidence,evidence,degraded,warnings} efficiencySignal<0||financingEfficiency<0
 * 模块: l1-input/efficiency_financing
 * 消费边: EFFICIENCY_FINANCING
 * 输入: efficiencySignal(0-1), financingEfficiency(0-1), investmentSignal(0-1)
 * 输出(正常): { value: 效率融资综合评分, confidence, evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings }
 *
 * 算法: weighted = (efficiency_signal × 0.4) + (financing_efficiency × 0.4) + (investment_signal × 0.2)
 */
export interface EfficiencyFinancingInput {
  efficiencySignal: number;      // 效率信号(0-1), -1=未配置
  financingEfficiency: number;   // 融资效率(0-1), -1=未配置
  investmentSignal: number;      // 投资信号(0-1), -1=未配置
}

export function computeEfficiencyFinancing(input: EfficiencyFinancingInput) {
  const warnings: string[] = [];
  const { efficiencySignal, financingEfficiency, investmentSignal } = input;

  if (efficiencySignal < 0 && financingEfficiency < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无效率与融资数据 — efficiencySignal与financingEfficiency均未配置'],
    };
  }

  const clampedEfficiency = Math.max(0, Math.min(1, efficiencySignal >= 0 ? efficiencySignal : 0.5));
  const clampedFinancing = Math.max(0, Math.min(1, financingEfficiency >= 0 ? financingEfficiency : 0.5));
  const clampedInvestment = Math.max(0, Math.min(1, investmentSignal >= 0 ? investmentSignal : 0.5));

  const value = Math.round(
    (clampedEfficiency * 0.4 + clampedFinancing * 0.4 + clampedInvestment * 0.2) * 1000,
  ) / 1000;

  const confidence = value > 0.6 ? 'high' as const : value > 0.3 ? 'medium' as const : 'low' as const;

  return {
    value,
    confidence,
    evidence: [`efficiencySignal: ${clampedEfficiency}`, `financingEfficiency: ${clampedFinancing}`, `investmentSignal: ${clampedInvestment}`],
    degraded: false,
    warnings,
  };
}
