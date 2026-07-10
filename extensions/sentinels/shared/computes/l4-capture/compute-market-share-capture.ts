/**
 * compute-market-share-capture.ts — 从竞品手中夺取或守住份额 (4.7)
 *
 * @contract COMPUTE-MARKET-SHARE-CAPTURE-v1 {MarketShareCaptureInput} {value,confidence,evidence,degraded,warnings} {无市场份额数据 → degraded:true, warnings:['无市场份额数据 — shareChange或competitorAggressiveness未配置']}
 * 模块: l4-capture/market_share_capture
 * 消费边: MARKET_SHARE_CAPTURE
 * 输入: shareChange(-1~1), competitorAggressiveness(0-1)
 * 输出(正常): { value: max(0, share_change × (1 - competitor_aggressiveness)), confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无市场份额数据'] }
 *
 * 算法: max(0, share_change × (1 - competitor_aggressiveness))
 * 说明: shareChange 可为负(丢失份额), 但capture值最低为0
 */
export interface MarketShareCaptureInput {
  shareChange: number;              // 份额变动(-1~1), -999=未配置
  competitorAggressiveness: number;  // 竞争强度(0-1), -1=未配置
}

export function computeMarketShareCapture(input: MarketShareCaptureInput) {
  const warnings: string[] = [];
  const { shareChange, competitorAggressiveness } = input;

  if (shareChange < -10 || competitorAggressiveness < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无市场份额数据 — shareChange或competitorAggressiveness未配置'],
    };
  }

  const clampedChange = Math.max(-1, Math.min(1, shareChange));
  const clampedAgg = Math.max(0, Math.min(1, competitorAggressiveness));

  const value = Math.round(Math.max(0, clampedChange * (1 - clampedAgg)) * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`shareChange: ${clampedChange}`, `competitorAggressiveness: ${clampedAgg}`],
    degraded: false,
    warnings,
  };
}
