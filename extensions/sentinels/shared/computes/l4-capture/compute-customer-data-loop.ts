/**
 * compute-customer-data-loop.ts — 客户使用数据引导产品改进 (4.6)
 *
 * 契约ID: COMPUTE-CUSTOMER-DATA-LOOP-v1
 * 模块: l4-capture/customer_data_loop
 * 消费边: CUSTOMER_DATA_LOOP
 * 输入: feedbackUtilization(0-1), improvementCycle(0-1)
 * 输出(正常): { value: feedback_utilization × improvement_cycle, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无反馈数据'] }
 *
 * 算法: feedback_utilization × improvement_cycle
 */
export interface CustomerDataLoopInput {
  feedbackUtilization: number; // 反馈利用率(0-1), -1=未配置
  improvementCycle: number;    // 改进周期(0-1), -1=未配置
}

export function computeCustomerDataLoop(input: CustomerDataLoopInput) {
  const warnings: string[] = [];
  const { feedbackUtilization, improvementCycle } = input;

  if (feedbackUtilization < 0 || improvementCycle < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无反馈数据 — feedbackUtilization或improvementCycle未配置'],
    };
  }

  const clampedUtil = Math.max(0, Math.min(1, feedbackUtilization));
  const clampedCycle = Math.max(0, Math.min(1, improvementCycle));

  const value = Math.round(clampedUtil * clampedCycle * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`feedbackUtilization: ${clampedUtil}`, `improvementCycle: ${clampedCycle}`],
    degraded: false,
    warnings,
  };
}
