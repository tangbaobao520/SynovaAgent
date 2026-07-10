/**
 * compute-tech-infrastructure.ts — IT系统/数据平台提升效率 (3.7)
 *
 * 契约ID: COMPUTE-TECH-INFRASTRUCTURE-v1
 * 模块: l3-output/tech_infrastructure
 * 消费边: TECH_INFRASTRUCTURE
 * 输入: techLeverageRatio(0-1), systemUptime(0-1)
 * 输出(正常): { value: tech_leverage_ratio × system_uptime, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无IT数据'] }
 *
 * 算法: tech_leverage_ratio × system_uptime
 */
export interface TechInfrastructureInput {
  techLeverageRatio: number; // 技术杠杆率(0-1), -1=未配置
  systemUptime: number;       // 系统可用率(0-1), -1=未配置
}

export function computeTechInfrastructure(input: TechInfrastructureInput) {
  const warnings: string[] = [];
  const { techLeverageRatio, systemUptime } = input;

  if (techLeverageRatio < 0 || systemUptime < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无IT数据 — techLeverageRatio或systemUptime未配置'],
    };
  }

  const clampedLeverage = Math.max(0, Math.min(1, techLeverageRatio));
  const clampedUptime = Math.max(0, Math.min(1, systemUptime));

  const value = Math.round(clampedLeverage * clampedUptime * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`techLeverageRatio: ${clampedLeverage}`, `systemUptime: ${clampedUptime}`],
    degraded: false,
    warnings,
  };
}
