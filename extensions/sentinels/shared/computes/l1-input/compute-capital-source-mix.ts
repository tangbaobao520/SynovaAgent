/**
 * compute-capital-source-mix.ts — 决定资金来源比例 (1.2)
 *
 * 契约ID: COMPUTE-CAPITAL-SOURCE-MIX-v1
 * 模块: l1-input/capital_source_mix
 * 消费边: CAPITAL_SOURCE_MIX
 * 输入: debtEquityRatio(number), sourceDiversification(0-1)
 * 输出(正常): { value: 资本结构健康度, confidence, evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['总资本为0'] }
 *
 * 算法: debt_ratio = debt/(debt+equity) — 从debtEquityRatio推导
 * health = (1 - |optimal_ratio - actual_ratio|) × diversification
 */
export interface CapitalSourceMixInput {
  debtEquityRatio: number;          // 负债权益比(debt/equity)
  sourceDiversification: number;    // 来源多元化(0-1), -1=未配置
}

export function computeCapitalSourceMix(input: CapitalSourceMixInput) {
  const warnings: string[] = [];
  const { debtEquityRatio, sourceDiversification } = input;

  if (debtEquityRatio < 0 || sourceDiversification < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['debtEquityRatio或sourceDiversification为负 — 数据异常'],
    };
  }

  const totalCapital = debtEquityRatio + 1; // equity=1, debt=debtEquityRatio
  if (totalCapital <= 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['总资本为0 — 无法计算资本结构'],
    };
  }

  const debtRatio = Math.min(1, debtEquityRatio / (1 + debtEquityRatio));
  const optimalDebtRatio = 0.5; // 中性负债率
  const distanceFromOptimal = Math.abs(optimalDebtRatio - debtRatio);
  const structureHealth = 1 - distanceFromOptimal;

  const clampedDiversification = Math.max(0, Math.min(1, sourceDiversification));
  const health = structureHealth * 0.6 + clampedDiversification * 0.4;
  const value = Math.round(health * 1000) / 1000;
  const confidence = value > 0.7 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`debtEquityRatio: ${debtEquityRatio}`, `diversification: ${clampedDiversification}`],
    degraded: false,
    warnings,
  };
}
