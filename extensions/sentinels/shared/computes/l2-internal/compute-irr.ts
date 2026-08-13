/**
 * compute-irr.ts — 内部收益率 (IRR)
 *
 * 契约ID: COMPUTE-IRR-v1
 * 管理经济学(托马斯) Ch14 — 资本预算
 * @input initialInvestment(number), cashFlows(number[])
 * @output { irr, npvAtWacc, paybackPeriod, profitabilityIndex }
 * @degraded initialInvestment<=0||cashFlows.length===0 -> degraded:true
 */
export interface IRRInterpretation { investmentGrade: string; returnVsCost: string; riskAssessment: string; }
export interface IRRResult { irr: number; npvAtWacc: number; paybackPeriod: number; profitabilityIndex: number; economicInterpretation: IRRInterpretation; degraded: boolean; warnings: string[]; }
export function computeIRR(initialInvestment: number, cashFlows: number[], wacc: number = 0.1): IRRResult {
  const w: string[] = [];
  if (initialInvestment <= 0 || cashFlows.length === 0) return { irr: 0, npvAtWacc: 0, paybackPeriod: 0, profitabilityIndex: 0,
    economicInterpretation: { investmentGrade: 'unknown', returnVsCost: '数据无效', riskAssessment: 'high' },
    degraded: true, warnings: ['Invalid inputs'] };
  let npv = -initialInvestment;
  let cumCF = 0; let payback = -1;
  for (let t = 0; t < cashFlows.length; t++) {
    npv += cashFlows[t] / Math.pow(1 + wacc, t + 1);
    if (payback < 0) { cumCF += cashFlows[t]; if (cumCF >= initialInvestment) payback = t + 1; }
  }
  if (payback < 0) payback = cashFlows.length;
  // IRR approx
  let irr = 0;
  if (npv > 0) { let lo = 0, hi = 1;
    for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; let n = -initialInvestment; for (let t = 0; t < cashFlows.length; t++) n += cashFlows[t] / Math.pow(1 + m, t + 1); if (n > 0) lo = m; else hi = m; }
    irr = Math.round((lo + hi) / 2 * 10000) / 10000; }
  const pi = initialInvestment > 0 ? Math.round((npv + initialInvestment) / initialInvestment * 100) / 100 : 0;
  return {
    irr: Math.round(irr * 10000) / 10000, npvAtWacc: Math.round(npv * 100) / 100, paybackPeriod: payback, profitabilityIndex: pi,
    economicInterpretation: {
      investmentGrade: irr > wacc ? 'viable' : irr > wacc * 0.8 ? 'borderline' : 'unviable',
      returnVsCost: irr > wacc ? `IRR(${(irr*100).toFixed(1)}%)>WACC(${(wacc*100).toFixed(1)}%)` : `IRR低于资金成本`,
      riskAssessment: payback > cashFlows.length * 0.7 ? '回收期长' : '回收期合理',
    }, degraded: false, warnings: w };
}
