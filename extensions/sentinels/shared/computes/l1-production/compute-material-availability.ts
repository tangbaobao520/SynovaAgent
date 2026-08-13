/**
 * compute-material-availability.ts — 物料可用性计算
 *
 * 契约ID: COMPUTE-MATERIAL-AVAILABILITY-v1
 * 模块: l1-production
 * 消费边: DEPENDS_ON, PRODUCES
 * 输入: available: number, required: number, leadTimeDays: number
 * 输出(正常): { value: number(可用率0-1+), confidence:'high', evidence:[], degraded:false }
 */
export function computeMaterialAvailability(available: number, required: number, leadTimeDays: number): {
  value: number;
  availabilityRate: number;
  stockStatus: 'sufficient' | 'low' | 'critical';
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  degraded: boolean;
  warnings: string[];
  computedAt: string;
} {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();

  if (required <= 0) {
    return { value: 1, availabilityRate: 1, stockStatus: 'sufficient', confidence: 'medium', evidence: [], degraded: true, warnings: ['需求量为0或负数 — 视为充足'], computedAt };
  }

  if (available < 0) {
    return { value: 0, availabilityRate: 0, stockStatus: 'critical', confidence: 'low', evidence: [], degraded: true, warnings: ['库存为负数 — 数据异常'], computedAt };
  }

  const availabilityRate = Math.min(available / required, 2);
  const stockStatus = availabilityRate >= 1.5 ? 'sufficient'
    : availabilityRate >= 0.8 ? 'low'
    : 'critical';

  if (leadTimeDays > 30 && stockStatus !== 'sufficient') {
    warnings.push(`前置时间${leadTimeDays}天超过30天 — 低库存风险高`);
  }

  return {
    value: Math.round(availabilityRate * 10000) / 10000,
    availabilityRate: Math.round(availabilityRate * 10000) / 10000,
    stockStatus,
    confidence: 'high',
    evidence: [`可用: ${available}`, `需求: ${required}`, `前置时间: ${leadTimeDays}天`],
    degraded: false,
    warnings,
    computedAt,
  };
}
