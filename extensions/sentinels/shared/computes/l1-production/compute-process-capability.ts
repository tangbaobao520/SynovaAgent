/**
 * compute-process-capability.ts — 过程能力指数计算 (Cpk)
 *
 * 契约ID: COMPUTE-PROCESS-CAPABILITY-v1
 * 模块: l1-production
 * 消费边: PRODUCES
 * 输入: samples: number[], usl: number, lsl: number
 * 输出(正常): { value: number(Cpk), confidence:'high', evidence:[], degraded:false }
 * Cpk = min((USL-μ)/3σ, (μ-LSL)/3σ)
 */
export function computeProcessCapability(samples: number[], usl: number, lsl: number): {
  value: number;
  cpk: number;
  mean: number;
  stdDev: number;
  capability: 'excellent' | 'good' | 'marginal' | 'poor';
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  degraded: boolean;
  warnings: string[];
  computedAt: string;
} {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();

  if (!samples || samples.length < 2) {
    return { value: 0, cpk: 0, mean: 0, stdDev: 0, capability: 'poor', confidence: 'low', evidence: [], degraded: true, warnings: ['样本数不足2 — 无法计算'], computedAt };
  }

  if (usl <= lsl) {
    return { value: 0, cpk: 0, mean: 0, stdDev: 0, capability: 'poor', confidence: 'low', evidence: [], degraded: true, warnings: ['规格上限(USL)必须大于下限(LSL)'], computedAt };
  }

  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
  const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / (samples.length - 1);
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    return { value: Infinity, cpk: Infinity, mean: Math.round(mean * 100) / 100, stdDev: 0, capability: 'excellent', confidence: 'medium', evidence: [`样本数: ${samples.length}`, `均值: ${mean.toFixed(2)}`], degraded: false, warnings: ['标准差为0 — 所有样本值相同'], computedAt };
  }

  const cpk = Math.min((usl - mean) / (3 * stdDev), (mean - lsl) / (3 * stdDev));
  const capability = cpk >= 1.67 ? 'excellent' : cpk >= 1.33 ? 'good' : cpk >= 1.0 ? 'marginal' : 'poor';

  return {
    value: Math.round(cpk * 10000) / 10000,
    cpk: Math.round(cpk * 10000) / 10000,
    mean: Math.round(mean * 100) / 100,
    stdDev: Math.round(stdDev * 10000) / 10000,
    capability,
    confidence: samples.length >= 30 ? 'high' : samples.length >= 10 ? 'medium' : 'low',
    evidence: [`样本数: ${samples.length}`, `均值: ${mean.toFixed(2)}`, `标准差: ${stdDev.toFixed(4)}`, `Cpk: ${cpk.toFixed(4)}`],
    degraded: false,
    warnings,
    computedAt,
  };
}
