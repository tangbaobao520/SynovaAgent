/**
 * compute-customer-demand-structure.ts — 客户需求结构分析
 *
 * 契约ID: COMPUTE-CUSTOMER-DEMAND-STRUCTURE-v1
 * 模块: l2-value
 * 消费边: SUBSTITUTES
 * 输入: categories: Array<{ name: string; demandShare: number }>
 * 输出(正常): { value: number(HHI集中度), confidence:'high', evidence:[], degraded:false }
 * HHI = Σ(share_i)^2, 衡量需求结构集中度
 */
export function computeCustomerDemandStructure(categories: Array<{ name: string; demandShare: number }>): {
  value: number;
  hhi: number;
  concentration: 'diversified' | 'moderate' | 'concentrated' | 'highly_concentrated';
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  degraded: boolean;
  warnings: string[];
  computedAt: string;
} {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();

  if (!categories || categories.length === 0) {
    return { value: 0, hhi: 0, concentration: 'diversified', confidence: 'low', evidence: [], degraded: true, warnings: ['无需求分类数据'], computedAt };
  }

  const totalShare = categories.reduce((s, c) => s + Math.abs(c.demandShare), 0);
  if (totalShare === 0) {
    return { value: 0, hhi: 0, concentration: 'diversified', confidence: 'medium', evidence: [], degraded: true, warnings: ['需求份额总和为0'], computedAt };
  }

  const hhi = categories.reduce((s, c) => {
    const share = Math.abs(c.demandShare) / totalShare;
    return s + share * share;
  }, 0);

  const concentration = hhi < 0.1 ? 'diversified' : hhi < 0.15 ? 'moderate' : hhi < 0.25 ? 'concentrated' : 'highly_concentrated';

  return {
    value: Math.round(hhi * 10000) / 10000,
    hhi: Math.round(hhi * 10000) / 10000,
    concentration,
    confidence: categories.length >= 3 ? 'high' : 'medium',
    evidence: [`分类数: ${categories.length}`, `HHI: ${hhi.toFixed(4)}`],
    degraded: false,
    warnings,
    computedAt,
  };
}
