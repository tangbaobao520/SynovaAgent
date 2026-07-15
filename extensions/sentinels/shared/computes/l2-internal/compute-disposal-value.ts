/**
 * compute-disposal-value.ts — 资产处置价值 (Disposal Value)
 *
 * 契约ID: COMPUTE-DISPOSAL-VALUE-v1
 * 管理经济学(托马斯) Ch15 — 资产处置
 * @input assets: Array<{name:string, bookValue:number, marketValue:number, disposalCost:number}>
 * @output { totalDisposalValue, totalGainLoss, netProceeds, recommendation }
 * @degraded assets.length===0 -> degraded:true
 */
export interface DisposalInterpretation { disposalUrgency: string; assetTypeMix: string; reinvestmentSuggestion: string; }
export interface DisposalResult { totalDisposalValue: number; totalGainLoss: number; netProceeds: number; recommendation: string; economicInterpretation: DisposalInterpretation; degraded: boolean; warnings: string[]; }
export function computeDisposalValue(assets: Array<{ name: string; bookValue: number; marketValue: number; disposalCost: number }>): DisposalResult {
  const w: string[] = [];
  if (assets.length === 0) return { totalDisposalValue: 0, totalGainLoss: 0, netProceeds: 0, recommendation: 'none',
    economicInterpretation: { disposalUrgency: 'unknown', assetTypeMix: '无资产数据', reinvestmentSuggestion: 'N/A' },
    degraded: true, warnings: ['No assets'] };
  const totalMV = assets.reduce((s, a) => s + a.marketValue, 0);
  const totalBV = assets.reduce((s, a) => s + a.bookValue, 0);
  const totalCost = assets.reduce((s, a) => s + a.disposalCost, 0);
  const gainLoss = totalMV - totalBV;
  const netProceeds = totalMV - totalCost;
  const gainers = assets.filter(a => a.marketValue > a.bookValue).length;
  return {
    totalDisposalValue: Math.round(totalMV * 100) / 100,
    totalGainLoss: Math.round(gainLoss * 100) / 100,
    netProceeds: Math.round(netProceeds * 100) / 100,
    recommendation: gainLoss > 0 ? '考虑处置增值资产释放价值' : '持有待估值回升',
    economicInterpretation: {
      disposalUrgency: gainers > assets.length / 2 ? '有处置机会' : '持有为主',
      assetTypeMix: `增值资产${gainers}/${assets.length}`,
      reinvestmentSuggestion: netProceeds > 0 ? `处置后可再投资 ${netProceeds.toFixed(0)}` : '处置收益不足以覆盖成本',
    }, degraded: false, warnings: w };
}
