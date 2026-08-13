/**
 * compute-intervention-effect.ts — 干预效果评估
 *
 * 契约ID: COMPUTE-INTERVENTION-EFFECT-v1
 * 模块: l3-causal
 * 消费边: SIGNAL_TRANSMITS
 * 输入: preIntervention: number[], postIntervention: number[]
 * 输出(正常): { value: number(效果量), confidence:'high', evidence:[], degraded:false }
 * 效果量 = (postMean - preMean) / pooledStdDev (Cohen's d)
 */
export function computeInterventionEffect(preIntervention: number[], postIntervention: number[]): {
  value: number;
  cohensD: number;
  preMean: number;
  postMean: number;
  effectSize: 'negligible' | 'small' | 'medium' | 'large';
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  degraded: boolean;
  warnings: string[];
  computedAt: string;
} {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();

  if (!preIntervention || preIntervention.length < 2 || !postIntervention || postIntervention.length < 2) {
    return { value: 0, cohensD: 0, preMean: 0, postMean: 0, effectSize: 'negligible', confidence: 'low', evidence: [], degraded: true, warnings: ['干预期前后样本数均需>=2'], computedAt };
  }

  const preMean = preIntervention.reduce((s, v) => s + v, 0) / preIntervention.length;
  const postMean = postIntervention.reduce((s, v) => s + v, 0) / postIntervention.length;

  const preVar = preIntervention.reduce((s, v) => s + (v - preMean) ** 2, 0) / (preIntervention.length - 1);
  const postVar = postIntervention.reduce((s, v) => s + (v - postMean) ** 2, 0) / (postIntervention.length - 1);

  const pooledStdDev = Math.sqrt(((preIntervention.length - 1) * preVar + (postIntervention.length - 1) * postVar) / (preIntervention.length + postIntervention.length - 2));

  if (pooledStdDev === 0) {
    return { value: 0, cohensD: 0, preMean: Math.round(preMean * 100) / 100, postMean: Math.round(postMean * 100) / 100, effectSize: 'negligible', confidence: 'low', evidence: [`干预前均值: ${preMean.toFixed(2)}`, `干预后均值: ${postMean.toFixed(2)}`], degraded: true, warnings: ['合并标准差为0'], computedAt };
  }

  const cohensD = (postMean - preMean) / pooledStdDev;
  const absD = Math.abs(cohensD);
  const effectSize = absD >= 0.8 ? 'large' : absD >= 0.5 ? 'medium' : absD >= 0.2 ? 'small' : 'negligible';

  return {
    value: Math.round(cohensD * 10000) / 10000,
    cohensD: Math.round(cohensD * 10000) / 10000,
    preMean: Math.round(preMean * 100) / 100,
    postMean: Math.round(postMean * 100) / 100,
    effectSize,
    confidence: preIntervention.length >= 30 && postIntervention.length >= 30 ? 'high' : 'medium',
    evidence: [`干预前样本: ${preIntervention.length}`, `干预后样本: ${postIntervention.length}`, `效应量(Cohen's d): ${cohensD.toFixed(4)}`],
    degraded: false,
    warnings,
    computedAt,
  };
}
