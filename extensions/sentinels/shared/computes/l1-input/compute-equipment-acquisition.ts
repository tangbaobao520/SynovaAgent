/**
 * compute-equipment-acquisition.ts — 获取生产设备与设施 (1.6)
 *
 * @contract COMPUTE-EQUIPMENT-ACQUISITION-v1 EquipmentAcquisitionInput {value,confidence,evidence,degraded,warnings} avgUtilizationRate<0||totalCapacityAdded<0||unitsAcquired<0
 * 模块: l1-input/equipment_acquisition
 * 消费边: EQUIPMENT_ACQUISITION
 * 输入: unitsAcquired(number), totalCapacityAdded(number), avgUtilizationRate(0-1)
 * 输出(正常): { value: 设备获取效率, confidence, evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['额定产能为0'] }
 *
 * 算法: capacity_efficiency = (capacity_added × utilization) / max_possible
 */
export interface EquipmentAcquisitionInput {
  unitsAcquired: number;           // 获取设备台数
  totalCapacityAdded: number;      // 新增总产能
  avgUtilizationRate: number;      // 平均利用率(0-1), -1=未配置
}

export function computeEquipmentAcquisition(input: EquipmentAcquisitionInput) {
  const warnings: string[] = [];
  const { unitsAcquired, totalCapacityAdded, avgUtilizationRate } = input;

  if (avgUtilizationRate < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['avgUtilizationRate未配置 — 无法计算设备获取效率'],
    };
  }

  if (totalCapacityAdded < 0 || unitsAcquired < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['unitsAcquired或totalCapacityAdded为负 — 数据异常'],
    };
  }

  const clampedUtilization = Math.max(0, Math.min(1, avgUtilizationRate));
  const capacityPerUnit = unitsAcquired > 0 ? totalCapacityAdded / unitsAcquired : 0;
  const maxEfficiency = 1;
  const efficiency = (Math.min(1, totalCapacityAdded / 1000) * clampedUtilization) / maxEfficiency;
  const value = Math.round(Math.min(1, efficiency) * 1000) / 1000;
  const confidence = clampedUtilization > 0.7 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`unitsAcquired: ${unitsAcquired}`, `capacityAdded: ${totalCapacityAdded}`, `utilization: ${clampedUtilization}`],
    degraded: false,
    warnings,
  };
}
