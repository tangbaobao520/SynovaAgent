/**
 * compute-demand-to-spec.ts — 把市场需求转化为产品规格 (3.4)
 *
 * @contract COMPUTE-DEMAND-TO-SPEC-v1 DemandToSpecInput {value,confidence,evidence,degraded,warnings} marketSignalAccuracy<0||specConversionRate<0
 * 模块: l3-output/demand_to_spec
 * 消费边: DEMAND_TO_SPEC
 * 输入: marketSignalAccuracy(0-1), specConversionRate(0-1)
 * 输出(正常): { value: market_signal_accuracy × spec_conversion_rate, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无市场数据'] }
 *
 * 算法: market_signal_accuracy × spec_conversion_rate
 */
export interface DemandToSpecInput {
  marketSignalAccuracy: number; // 市场信号准确度(0-1), -1=未配置
  specConversionRate: number;   // 规格转化率(0-1), -1=未配置
}

export function computeDemandToSpec(input: DemandToSpecInput) {
  const warnings: string[] = [];
  const { marketSignalAccuracy, specConversionRate } = input;

  if (marketSignalAccuracy < 0 || specConversionRate < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无市场数据 — marketSignalAccuracy或specConversionRate未配置'],
    };
  }

  const clampedAccuracy = Math.max(0, Math.min(1, marketSignalAccuracy));
  const clampedConversion = Math.max(0, Math.min(1, specConversionRate));

  const value = Math.round(clampedAccuracy * clampedConversion * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`marketSignalAccuracy: ${clampedAccuracy}`, `specConversionRate: ${clampedConversion}`],
    degraded: false,
    warnings,
  };
}
