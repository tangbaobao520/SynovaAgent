/**
 * compute-capacity-utilization.ts — 产能利用率计算
 *
 * 契约ID: COMPUTE-CAPACITY-UTILIZATION-v1
 * 模块: l1-production
 * 消费边: PRODUCES
 * 输入: actualOutput: number — 实际产出量; theoreticalCapacity: number — 理论产能
 * 输出(正常): { value: number(比率0-1+), confidence:'high', evidence:[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无产能数据'] }
 * 边界: 理论产能=0 → 0。实际>理论→>1.0(超负荷)。
 * 超时: 5秒。不抛异常。
 */
export interface CapacityOutput {
  value: number;
  utilizationRate: number;
  status: 'under' | 'normal' | 'over' | 'critical';
  evidence: string[];
  confidence: 'high' | 'low';
  degraded: boolean;
  warnings: string[];
  computedAt: string;
}

export function computeCapacityUtilization(
  actualOutput: number,
  theoreticalCapacity: number,
): CapacityOutput {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();

  if (theoreticalCapacity <= 0) {
    return {
      value: 0,
      utilizationRate: 0,
      status: 'critical',
      confidence: 'low',
      evidence: [],
      degraded: true,
      warnings: ['理论产能为0或负数 — 无法计算利用率'],
      computedAt,
    };
  }

  if (actualOutput < 0) {
    return {
      value: 0,
      utilizationRate: 0,
      status: 'critical',
      confidence: 'low',
      evidence: [],
      degraded: true,
      warnings: ['实际产出为负数 — 数据异常'],
      computedAt,
    };
  }

  const utilizationRate = actualOutput / theoreticalCapacity;
  const status = utilizationRate < 0.5 ? 'under'
    : utilizationRate < 0.85 ? 'normal'
    : utilizationRate <= 1.0 ? 'over'
    : 'critical';

  if (utilizationRate > 1.0) {
    warnings.push(`利用率${(utilizationRate * 100).toFixed(0)}%超过100% — 超负荷运行`);
  }

  return {
    value: Math.round(utilizationRate * 10000) / 10000,
    utilizationRate: Math.round(utilizationRate * 10000) / 10000,
    status,
    confidence: 'high',
    evidence: [`实际产出: ${actualOutput}`, `理论产能: ${theoreticalCapacity}`],
    degraded: false,
    warnings,
    computedAt,
  };
}
