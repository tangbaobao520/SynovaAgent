/**
 * compute-market-structure-diagnosis.ts — 市场结构诊断
 *
 * 契约ID: COMPUTE-MARKET-STRUCTURE-v1
 * 管理经济学(托马斯) Ch7 — 市场结构
 * @input hhi(number), firmCount(number), top3Share(number)
 * @output { structure, concentrationLevel, entryBarrierEstimate }
 * @degraded hhi<0 -> degraded:true
 */
export interface MarketStructureInterpretation { structureLabel: string; competitiveDynamics: string; regulatoryRisk: string; }
export interface MarketStructureResult { structure: string; concentrationLevel: string; entryBarrierEstimate: string; economicInterpretation: MarketStructureInterpretation; degraded: boolean; warnings: string[]; }
export function computeMarketStructureDiagnosis(hhi: number, firmCount: number, top3Share: number): MarketStructureResult {
  const w: string[] = [];
  if (hhi < 0 || firmCount < 1) return { structure: 'unknown', concentrationLevel: 'unknown', entryBarrierEstimate: 'unknown',
    economicInterpretation: { structureLabel: 'unknown', competitiveDynamics: '数据无效', regulatoryRisk: 'high' },
    degraded: true, warnings: ['Invalid market data'] };
  const structure = hhi > 0.25 ? 'oligopoly' : hhi > 0.1 ? 'monopolistic_competition' : 'perfect_competition';
  return { structure, concentrationLevel: hhi > 0.25 ? 'high' : hhi > 0.1 ? 'moderate' : 'low',
    entryBarrierEstimate: top3Share > 0.8 ? 'high' : top3Share > 0.5 ? 'moderate' : 'low',
    economicInterpretation: {
      structureLabel: structure === 'oligopoly' ? '寡头市场' : structure === 'monopolistic_competition' ? '垄断竞争' : '完全竞争',
      competitiveDynamics: hhi > 0.25 ? '少数企业主导，价格协调可能' : '竞争充分',
      regulatoryRisk: hhi > 0.25 ? '可能触发反垄断关注' : '低监管风险',
    }, degraded: false, warnings: w };
}
