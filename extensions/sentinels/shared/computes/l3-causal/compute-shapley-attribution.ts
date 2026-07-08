/**
 * compute-shapley-attribution.ts — 多因素Shapley值归因
 *
 * 契约ID: COMPUTE-SHAPLEY-ATTRIBUTION-v1
 * 模块: l3-causal
 * 消费边: SIGNAL_TRANSMITS, INCENTIVE_BINDS, PRODUCES
 * 输入: factors: Array<{ name: string; marginalContribution: number }> — N个因素的边际贡献
 * 输出(正常): { value: AttributionResult[], confidence:'high', evidence:[], degraded:false }
 * 输出(降级): { value:[], confidence:'low', degraded:true, warnings:['无因素数据'] }
 * 边界: 单因素→权重1.0。空输入→降级。
 * 超时: 5秒。不抛异常。
 *
 * Shapley值 = Σ_{S⊆N\{i}} (|S|!(n-|S|-1)!)/n! × (v(S∪{i}) - v(S))
 * 简化实现：等权归一化(各因素贡献/总贡献)
 */
export interface FactorInput {
  name: string;
  marginalContribution: number;
}

export interface AttributionResult {
  factor: string;
  weight: number;
  confidenceInterval: [number, number];
}

export interface ShapleyOutput {
  attributions: AttributionResult[];
  totalContribution: number;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  degraded: boolean;
  warnings: string[];
  computedAt: string;
}

export function computeShapleyAttribution(factors: FactorInput[]): ShapleyOutput {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();

  if (!factors || factors.length === 0) {
    return {
      attributions: [],
      totalContribution: 0,
      confidence: 'low',
      evidence: [],
      degraded: true,
      warnings: ['无因素数据 — 无法计算归因'],
      computedAt,
    };
  }

  const totalMC = factors.reduce((s, f) => s + Math.abs(f.marginalContribution), 0);

  if (totalMC === 0) {
    const equalWeight = 1 / factors.length;
    return {
      attributions: factors.map(f => ({
        factor: f.name,
        weight: equalWeight,
        confidenceInterval: [equalWeight - 0.1, equalWeight + 0.1] as [number, number],
      })),
      totalContribution: 0,
      confidence: 'medium',
      evidence: [`因素数: ${factors.length}`, '总边际贡献为0，使用等权归因'],
      degraded: false,
      warnings: ['总边际贡献为0 — 采用等权归因'],
      computedAt,
    };
  }

  // Simplified Shapley: weight = |marginalContribution| / totalMC
  // Confidence interval: CI = weight ± 0.15 (simplified)
  const attributions: AttributionResult[] = factors.map(f => {
    const weight = Math.abs(f.marginalContribution) / totalMC;
    const halfWidth = Math.min(0.15, weight * 0.3);
    return {
      factor: f.name,
      weight: Math.round(weight * 10000) / 10000,
      confidenceInterval: [
        Math.round(Math.max(0, weight - halfWidth) * 10000) / 10000,
        Math.round(Math.min(1, weight + halfWidth) * 10000) / 10000,
      ] as [number, number],
    };
  });

  const confidence = factors.length >= 5 ? 'high' : factors.length >= 3 ? 'medium' : 'low';

  return {
    attributions,
    totalContribution: Math.round(totalMC * 100) / 100,
    confidence,
    evidence: [`因素数: ${factors.length}`, `总边际贡献: ${totalMC}`],
    degraded: false,
    warnings,
    computedAt,
  };
}
