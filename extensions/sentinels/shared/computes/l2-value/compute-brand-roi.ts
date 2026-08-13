/**
 * compute-brand-roi.ts — 品牌投资回报率计算
 *
 * 契约ID: COMPUTE-BRAND-ROI-v1
 * 模块: l2-value
 * 消费边: BRAND_BUILDS
 * 输入: brandInvestment(number), awarenessLift(number 0-1), premiumRatioChange(number),
 *       repeatPurchaseLift(number 0-1), npsChange(number), lagMonths(number), dataMonths(number)
 * 输出(正常): { roi:number, brandHealthScore:number, confidence:'high', evidence:[], degraded:false }
 * 输出(降级): { roi:0, brandHealthScore:0, confidence:'low', degraded:true, warnings:['...'] }
 *
 * 计算公式:
 *   f = awarenessLift*0.25 + premiumRatioChange*0.30 + repeatPurchaseLift*0.25 + npsChange*0.20
 *   roi = (revenue_lift_estimated - brandInvestment) / brandInvestment
 *   brandHealthScore = f * 100
 *
 * 降级条件:
 *   dataMonths < 6 → 跳过（数据不足，无法做滞后因果推断）
 *   6 ≤ dataMonths < 18 → degraded:true + 标注"数据不足，置信度低"
 *   brandInvestment = 0 → degraded:true + "无品牌投入数据"
 */

export interface BrandROIParams {
  brandInvestment: number;
  awarenessLift: number;
  premiumRatioChange: number;
  repeatPurchaseLift: number;
  npsChange: number;
  lagMonths: number;
  dataMonths: number;
}

export interface BrandROIResult {
  roi: number;
  brandHealthScore: number;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  degraded: boolean;
  warnings: string[];
}

export function computeBrandROI(params: BrandROIParams): BrandROIResult {
  const { brandInvestment, awarenessLift, premiumRatioChange, repeatPurchaseLift, npsChange, lagMonths, dataMonths } = params;

  // 降级：数据不足
  if (dataMonths < 6) {
    return { roi: 0, brandHealthScore: 0, confidence: 'low', evidence: [], degraded: true, warnings: ['数据不足(<6个月)，无法进行滞后因果推断'] };
  }
  if (brandInvestment === 0) {
    return { roi: 0, brandHealthScore: 0, confidence: 'low', evidence: [], degraded: true, warnings: ['无品牌投入数据'] };
  }

  // 品牌健康分
  const f = awarenessLift * 0.25 + premiumRatioChange * 0.30 + repeatPurchaseLift * 0.25 + npsChange * 0.20;
  const brandHealthScore = Math.max(0, Math.min(100, f * 100));

  // ROI（简化版：用品牌健康分估算收入增量）
  const revenueLiftEstimated = brandInvestment * (1 + f);
  const roi = (revenueLiftEstimated - brandInvestment) / brandInvestment;

  const confidence = dataMonths >= 18 ? 'high' : 'medium';
  const warnings: string[] = [];
  if (dataMonths < 18) {
    warnings.push(`数据仅${dataMonths}个月(<18)，滞后因果推断置信度降低`);
  }

  return { roi, brandHealthScore, confidence, evidence: [`lagMonths=${lagMonths}`], degraded: dataMonths < 18, warnings };
}
