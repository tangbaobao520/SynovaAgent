/**
 * compute-brand-building.ts — 品牌投入变为客户信任与溢价 (3.3)
 *
 * 契约ID: COMPUTE-BRAND-BUILDING-v1
 * 模块: l3-output/brand_building
 * 消费边: BRAND_BUILDING
 * 输入: brandInvestment(0-1), brandElasticity(0-1)
 * 输出(正常): { value: brand_investment × brand_elasticity, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无品牌数据'] }
 *
 * 算法: brand_investment × brand_elasticity  (lag 6-18月)
 */
export interface BrandBuildingInput {
  brandInvestment: number;  // 品牌投入强度(0-1), -1=未配置
  brandElasticity: number;  // 品牌弹性(0-1), -1=未配置
}

export function computeBrandBuilding(input: BrandBuildingInput) {
  const warnings: string[] = [];
  const { brandInvestment, brandElasticity } = input;

  if (brandInvestment < 0 || brandElasticity < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无品牌数据 — brandInvestment或brandElasticity未配置'],
    };
  }

  const clampedInvestment = Math.max(0, Math.min(1, brandInvestment));
  const clampedElasticity = Math.max(0, Math.min(1, brandElasticity));

  const value = Math.round(clampedInvestment * clampedElasticity * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`brandInvestment: ${clampedInvestment}`, `brandElasticity: ${clampedElasticity}`],
    degraded: false,
    warnings,
  };
}
