/**
 * compute-operation-performance.ts — 运营绩效评分
 *
 * 契约ID: COMPUTE-OPERATION-PERFORMANCE-v1
 * 模块: l1-production
 * 消费边: PRODUCES
 * 输入: metrics: Array<{ name: string; actual: number; target: number; weight: number }>
 * 输出(正常): { value: number(0-1综合评分), confidence:'high', evidence:[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无指标数据'] }
 */
export interface PerfMetric {
  name: string;
  actual: number;
  target: number;
  weight: number;
}

export function computeOperationPerformance(metrics: PerfMetric[]): {
  value: number;
  details: { metric: string; score: number }[];
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  degraded: boolean;
  warnings: string[];
  computedAt: string;
} {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();

  if (!metrics || metrics.length === 0) {
    return { value: 0, details: [], confidence: 'low', evidence: [], degraded: true, warnings: ['无运营指标数据'], computedAt };
  }

  const totalWeight = metrics.reduce((s, m) => s + Math.abs(m.weight), 0);
  if (totalWeight === 0) {
    return { value: 0, details: [], confidence: 'low', evidence: [], degraded: true, warnings: ['指标权重总和为0'], computedAt };
  }

  const details = metrics.map(m => {
    const score = m.target > 0 ? Math.min(m.actual / m.target, 1.5) : 0;
    return { metric: m.name, score: Math.round(score * 10000) / 10000 };
  });

  const weightedScore = details.reduce((s, d, i) => {
    const w = Math.abs(metrics[i].weight) / totalWeight;
    return s + d.score * w;
  }, 0);

  return {
    value: Math.round(Math.min(weightedScore, 1) * 10000) / 10000,
    details,
    confidence: metrics.length >= 3 ? 'high' : 'medium',
    evidence: [`指标数: ${metrics.length}`, `综合评分: ${(Math.min(weightedScore, 1) * 100).toFixed(0)}%`],
    degraded: false,
    warnings,
    computedAt,
  };
}
