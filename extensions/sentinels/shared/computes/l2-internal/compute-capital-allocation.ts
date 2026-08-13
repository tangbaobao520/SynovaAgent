/**
 * compute-capital-allocation.ts — 把钱分配到活动中 (2.1)
 *
 * @contract COMPUTE-CAPITAL-ALLOCATION-v1 CapitalAllocationInput {value,confidence,evidence,degraded,warnings} allocationRatio<0||reallocationFrequency<0
 * 模块: l2-internal/capital_allocation
 * 消费边: CAPITAL_ALLOCATION
 * 输入: allocationRatio(0-1), reallocationFrequency(0-1)
 * 输出(正常): { value: allocation_ratio × reallocation_frequency, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无资本池数据'] }
 *
 * 算法: allocation_ratio × reallocation_frequency
 */
export interface CapitalAllocationInput {
  allocationRatio: number;       // 资本分配比例(0-1), -1=未配置
  reallocationFrequency: number; // 再分配频率(0-1), -1=未配置
}

export function computeCapitalAllocation(input: CapitalAllocationInput) {
  const warnings: string[] = [];
  const { allocationRatio, reallocationFrequency } = input;

  if (allocationRatio < 0 || reallocationFrequency < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无资本池数据 — allocationRatio或reallocationFrequency未配置'],
    };
  }

  const clampedRatio = Math.max(0, Math.min(1, allocationRatio));
  const clampedFreq = Math.max(0, Math.min(1, reallocationFrequency));

  const value = Math.round(clampedRatio * clampedFreq * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`allocationRatio: ${clampedRatio}`, `reallocationFrequency: ${clampedFreq}`],
    degraded: false,
    warnings,
  };
}
