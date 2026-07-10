/**
 * compute-service-support.ts — 产品售出后的服务支持 (3.5)
 *
 * 契约ID: COMPUTE-SERVICE-SUPPORT-v1
 * 模块: l3-output/service_support
 * 消费边: SERVICE_SUPPORT
 * 输入: satisfactionScore(0-1), resolutionSpeed(0-1)
 * 输出(正常): { value: satisfaction_score × resolution_speed, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无售后数据'] }
 *
 * 算法: satisfaction_score × resolution_speed
 */
export interface ServiceSupportInput {
  satisfactionScore: number; // 客户满意度(0-1), -1=未配置
  resolutionSpeed: number;   // 问题解决速度(0-1), -1=未配置
}

export function computeServiceSupport(input: ServiceSupportInput) {
  const warnings: string[] = [];
  const { satisfactionScore, resolutionSpeed } = input;

  if (satisfactionScore < 0 || resolutionSpeed < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无售后数据 — satisfactionScore或resolutionSpeed未配置'],
    };
  }

  const clampedSatisfaction = Math.max(0, Math.min(1, satisfactionScore));
  const clampedSpeed = Math.max(0, Math.min(1, resolutionSpeed));

  const value = Math.round(clampedSatisfaction * clampedSpeed * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`satisfactionScore: ${clampedSatisfaction}`, `resolutionSpeed: ${clampedSpeed}`],
    degraded: false,
    warnings,
  };
}
