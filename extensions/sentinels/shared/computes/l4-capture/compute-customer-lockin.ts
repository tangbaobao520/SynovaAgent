/**
 * compute-customer-lockin.ts — 让客户不容易离开 (4.2)
 *
 * 契约ID: COMPUTE-CUSTOMER-LOCKIN-v1
 * 模块: l4-capture/customer_lockin
 * 消费边: CUSTOMER_LOCKIN
 * 输入: switchingCost(0-1), lockTypeDepth(0-1)
 * 输出(正常): { value: switching_cost × lock_type_depth, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无客户数据'] }
 *
 * 算法: switching_cost × lock_type_depth
 */
export interface CustomerLockinInput {
  switchingCost: number;   // 切换成本(0-1), -1=未配置
  lockTypeDepth: number;   // 锁定深度(0-1), -1=未配置
}

export function computeCustomerLockin(input: CustomerLockinInput) {
  const warnings: string[] = [];
  const { switchingCost, lockTypeDepth } = input;

  if (switchingCost < 0 || lockTypeDepth < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无客户数据 — switchingCost或lockTypeDepth未配置'],
    };
  }

  const clampedCost = Math.max(0, Math.min(1, switchingCost));
  const clampedDepth = Math.max(0, Math.min(1, lockTypeDepth));

  const value = Math.round(clampedCost * clampedDepth * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`switchingCost: ${clampedCost}`, `lockTypeDepth: ${clampedDepth}`],
    degraded: false,
    warnings,
  };
}
