/**
 * compute-survival-margin.ts — 生存边际 (Survival Margin)
 *
 * 契约ID: COMPUTE-SURVIVAL-MARGIN-v1
 * 管理经济学(托马斯) Ch8 — 生存原则
 * @input revenue(number), variableCost(number), fixedCost(number)
 * @output { survivalMargin, survivalRatio, isSurvivable, breakevenRequired }
 * @degraded revenue<=0 -> degraded:true
 */
export interface SurvivalMarginInterpretation {
  survivalStatus: string;
  marginCushion: string;
  adjustmentUrgency: string;
}
export interface SurvivalMarginResult {
  survivalMargin: number; survivalRatio: number; isSurvivable: boolean; breakevenRequired: number;
  economicInterpretation: SurvivalMarginInterpretation;
  degraded: boolean; warnings: string[];
}
export function computeSurvivalMargin(revenue: number, variableCost: number, fixedCost: number): SurvivalMarginResult {
  const w: string[] = [];
  if (revenue <= 0) {
    return { survivalMargin: 0, survivalRatio: 0, isSurvivable: false, breakevenRequired: 0,
      economicInterpretation: { survivalStatus: 'critical', marginCushion: '无收入', adjustmentUrgency: 'immediate' },
      degraded: true, warnings: ['Revenue must be positive'] };
  }
  const contribution = revenue - variableCost;
  const survivalMargin = contribution - fixedCost;
  const survivalRatio = revenue > 0 ? survivalMargin / revenue : 0;
  const beRequired = fixedCost > 0 ? fixedCost / (revenue - variableCost) * revenue : 0;
  return {
    survivalMargin: Math.round(survivalMargin * 100) / 100,
    survivalRatio: Math.round(survivalRatio * 10000) / 10000,
    isSurvivable: survivalMargin > 0,
    breakevenRequired: Math.round(beRequired * 100) / 100,
    economicInterpretation: {
      survivalStatus: survivalMargin > 0 ? 'profitable' : survivalMargin > -fixedCost * 0.5 ? 'marginal' : 'loss',
      marginCushion: survivalRatio > 0.2 ? '充足缓冲' : survivalRatio > 0 ? '微薄缓冲' : '负缓冲',
      adjustmentUrgency: survivalMargin > 0 ? 'normal' : survivalMargin > -fixedCost * 0.5 ? 'within_quarter' : 'immediate',
    }, degraded: false, warnings: w };
}
