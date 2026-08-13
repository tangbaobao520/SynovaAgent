/**
 * compute-value-pricing.ts — 把价值转化为购买价格 (4.1)
 *
 * @contract COMPUTE-VALUE-PRICING-v1 {ValuePricingInput} {value,confidence,evidence,degraded,warnings} {无定价数据 → degraded:true, warnings:['无定价数据 — pricingPower或priceElasticityFactor未配置']}
 * 模块: l4-capture/value_pricing
 * 消费边: VALUE_PRICING
 * 输入: pricingPower(0-1), priceElasticityFactor(0-1)
 * 输出(正常): { value: pricing_power × price_elasticity_factor, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无定价数据'] }
 *
 * 算法: pricing_power × price_elasticity_factor
 */
export interface ValuePricingInput {
  pricingPower: number;         // 定价权(0-1), -1=未配置
  priceElasticityFactor: number; // 价格弹性系数(0-1), -1=未配置
}

export function computeValuePricing(input: ValuePricingInput) {
  const warnings: string[] = [];
  const { pricingPower, priceElasticityFactor } = input;

  if (pricingPower < 0 || priceElasticityFactor < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无定价数据 — pricingPower或priceElasticityFactor未配置'],
    };
  }

  const clampedPower = Math.max(0, Math.min(1, pricingPower));
  const clampedElasticity = Math.max(0, Math.min(1, priceElasticityFactor));

  const value = Math.round(clampedPower * clampedElasticity * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`pricingPower: ${clampedPower}`, `priceElasticityFactor: ${clampedElasticity}`],
    degraded: false,
    warnings,
  };
}
