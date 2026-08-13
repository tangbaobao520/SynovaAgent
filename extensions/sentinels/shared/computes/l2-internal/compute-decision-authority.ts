/**
 * compute-decision-authority.ts — 决定谁有权力分配资源 (2.2)
 *
 * @contract COMPUTE-DECISION-AUTHORITY-v1 DecisionAuthorityInput {value,confidence,evidence,degraded,warnings} concentrationIndex<0
 * 模块: l2-internal/decision_authority
 * 消费边: DECISION_AUTHORITY
 * 输入: concentrationIndex(0-1)
 * 输出(正常): { value: 1 - concentration_index, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无治理结构数据'] }
 *
 * 算法: 1 - concentration_index
 */
export interface DecisionAuthorityInput {
  concentrationIndex: number; // 决策集中度(0-1), -1=未配置
}

export function computeDecisionAuthority(input: DecisionAuthorityInput) {
  const warnings: string[] = [];
  const { concentrationIndex } = input;

  if (concentrationIndex < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无治理结构数据 — concentrationIndex未配置'],
    };
  }

  const clamped = Math.max(0, Math.min(1, concentrationIndex));
  const value = Math.round((1 - clamped) * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`concentrationIndex: ${clamped}`, `decentralized: ${(1 - clamped).toFixed(3)}`],
    degraded: false,
    warnings,
  };
}
