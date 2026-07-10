/**
 * compute-competitive-positioning.ts — 从竞品手中夺取或守住份额 (4.4)
 *
 * 契约ID: COMPUTE-COMPETITIVE-POSITIONING-v1
 * 模块: l4-capture/competitive_positioning
 * 消费边: COMPETITIVE_POSITIONING
 * 输入: switchingCost(0-1), networkEffect(0-1), scaleEconomy(0-1), counterPositioning(0-1), brandMoat(0-1), exclusiveResource(0-1), processAdvantage(0-1)
 * 输出(正常): { value: avg(七力评分), confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无竞品数据'] }
 *
 * 算法: 七力评分均值 (switching_cost + network_effect + scale_economy + counter_positioning + brand_moat + exclusive_resource + process_advantage) / 7
 */
export interface CompetitivePositioningInput {
  switchingCost: number;       // 切换成本(0-1), -1=未配置
  networkEffect: number;       // 网络效应(0-1), -1=未配置
  scaleEconomy: number;        // 规模经济(0-1), -1=未配置
  counterPositioning: number;  // 反定位(0-1), -1=未配置
  brandMoat: number;           // 品牌护城河(0-1), -1=未配置
  exclusiveResource: number;   // 独占资源(0-1), -1=未配置
  processAdvantage: number;    // 流程优势(0-1), -1=未配置
}

export function computeCompetitivePositioning(input: CompetitivePositioningInput) {
  const warnings: string[] = [];
  const { switchingCost, networkEffect, scaleEconomy, counterPositioning, brandMoat, exclusiveResource, processAdvantage } = input;

  const allForces = [switchingCost, networkEffect, scaleEconomy, counterPositioning, brandMoat, exclusiveResource, processAdvantage];
  if (allForces.some(f => f < 0)) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无竞品数据 — 七力指标中存在未配置项'],
    };
  }

  const clamped = allForces.map(f => Math.max(0, Math.min(1, f)));
  const value = Math.round(clamped.reduce((a, b) => a + b, 0) / 7 * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [
      `switchingCost: ${clamped[0]}`, `networkEffect: ${clamped[1]}`,
      `scaleEconomy: ${clamped[2]}`, `counterPositioning: ${clamped[3]}`,
      `brandMoat: ${clamped[4]}`, `exclusiveResource: ${clamped[5]}`,
      `processAdvantage: ${clamped[6]}`,
    ],
    degraded: false,
    warnings,
  };
}
