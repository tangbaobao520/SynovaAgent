/**
 * compute-synergy.ts — 并购协同效应 (M&A Synergy)
 *
 * 契约ID: COMPUTE-SYNERGY-v1
 * 管理经济学(托马斯) Ch15 — 并购协同
 * @input preMergerProfit(number), postMergerProjection: {revenue:number, cost:number}, synergyCost(number)
 * @output { grossSynergy, netSynergy, synergyRatio, isValueCreating }
 * @degraded preMergerProfit<=0 -> degraded:true
 */
export interface SynergyInterpretation { synergyType: string; integrationRisk: string; valueCreation: string; }
export interface SynergyResult { grossSynergy: number; netSynergy: number; synergyRatio: number; isValueCreating: boolean; economicInterpretation: SynergyInterpretation; degraded: boolean; warnings: string[]; }
export function computeSynergy(preMergerProfit: number, postMergerRevenue: number, postMergerCost: number, synergyCost: number): SynergyResult {
  const w: string[] = [];
  if (preMergerProfit <= 0) return { grossSynergy: 0, netSynergy: 0, synergyRatio: 0, isValueCreating: false,
    economicInterpretation: { synergyType: 'unknown', integrationRisk: 'high', valueCreation: '数据无效' },
    degraded: true, warnings: ['Pre-merger profit must be positive'] };
  const postProfit = postMergerRevenue - postMergerCost;
  const grossSynergy = postProfit - preMergerProfit;
  const netSynergy = grossSynergy - synergyCost;
  return {
    grossSynergy: Math.round(grossSynergy * 100) / 100,
    netSynergy: Math.round(netSynergy * 100) / 100,
    synergyRatio: preMergerProfit > 0 ? Math.round((grossSynergy / preMergerProfit) * 10000) / 10000 : 0,
    isValueCreating: netSynergy > 0,
    economicInterpretation: {
      synergyType: grossSynergy > 0 ? 'revenue_or_cost' : 'negative',
      integrationRisk: synergyCost > grossSynergy * 0.5 ? 'high' : 'moderate',
      valueCreation: netSynergy > 0 ? '并购创造价值' : '并购成本超过协同收益',
    }, degraded: false, warnings: w };
}
