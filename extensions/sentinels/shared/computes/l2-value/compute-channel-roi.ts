/**
 * compute-channel-roi.ts — 渠道ROI计算
 *
 * 契约ID: COMPUTE-CHANNEL-ROI-v1
 * 模块: l2-value
 * 消费边: DEPLOYS, FUNDS
 * 输入: cost: number, revenue: number
 * 输出(正常): { value: number(ROI比率), confidence:'high', evidence:[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无成本数据'] }
 * ROI = (revenue - cost) / cost
 */
export function computeChannelROI(cost: number, revenue: number): {
  value: number;
  roi: number;
  confidence: 'high' | 'low';
  evidence: string[];
  degraded: boolean;
  warnings: string[];
  computedAt: string;
} {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();

  if (cost < 0 || revenue < 0) {
    return { value: 0, roi: 0, confidence: 'low', evidence: [], degraded: true, warnings: ['成本或收入为负数 — 数据异常'], computedAt };
  }

  if (cost === 0) {
    return { value: revenue > 0 ? Infinity : 0, roi: revenue > 0 ? Infinity : 0, confidence: 'low', evidence: [`成本: ${cost}`, `收入: ${revenue}`], degraded: true, warnings: ['成本为0 — ROI无穷大，请确认数据'], computedAt };
  }

  const roi = (revenue - cost) / cost;
  const degraded = cost === 0 || (cost < 0);

  return {
    value: Math.round(roi * 10000) / 10000,
    roi: Math.round(roi * 10000) / 10000,
    confidence: degraded ? 'low' : 'high',
    evidence: [`成本: ${cost}`, `收入: ${revenue}`],
    degraded,
    warnings,
    computedAt,
  };
}
