/**
 * compute-rule-constraint.ts — 用规则限制不可以做什么 (2.6)
 *
 * 契约ID: COMPUTE-RULE-CONSTRAINT-v1
 * 模块: l2-internal/rule_constraint
 * 消费边: RULE_CONSTRAINT
 * 输入: ruleAppropriateness(0-1), constraintEffectiveness(0-1)
 * 输出(正常): { value: rule_appropriateness × constraint_effectiveness, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无规则数据'] }
 *
 * 算法: rule_appropriateness × constraint_effectiveness
 */
export interface RuleConstraintInput {
  ruleAppropriateness: number;    // 规则适当性(0-1), -1=未配置
  constraintEffectiveness: number; // 约束有效性(0-1), -1=未配置
}

export function computeRuleConstraint(input: RuleConstraintInput) {
  const warnings: string[] = [];
  const { ruleAppropriateness, constraintEffectiveness } = input;

  if (ruleAppropriateness < 0 || constraintEffectiveness < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无规则数据 — ruleAppropriateness或constraintEffectiveness未配置'],
    };
  }

  const clampedAppr = Math.max(0, Math.min(1, ruleAppropriateness));
  const clampedEff = Math.max(0, Math.min(1, constraintEffectiveness));

  const value = Math.round(clampedAppr * clampedEff * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`ruleAppropriateness: ${clampedAppr}`, `constraintEffectiveness: ${clampedEff}`],
    degraded: false,
    warnings,
  };
}
