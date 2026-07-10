/**
 * compute-channel-delivery.ts — 通过渠道送达客户 (4.3)
 *
 * @contract COMPUTE-CHANNEL-DELIVERY-v1 {ChannelDeliveryInput} {value,confidence,evidence,degraded,warnings} {无渠道数据 → degraded:true, warnings:['无渠道数据 — channelEfficiency或reachRatio未配置']}
 * 模块: l4-capture/channel_delivery
 * 消费边: CHANNEL_DELIVERY
 * 输入: channelEfficiency(0-1), reachRatio(0-1)
 * 输出(正常): { value: channel_efficiency × reach_ratio, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无渠道数据'] }
 *
 * 算法: channel_efficiency × reach_ratio
 */
export interface ChannelDeliveryInput {
  channelEfficiency: number; // 渠道效率(0-1), -1=未配置
  reachRatio: number;        // 触达比率(0-1), -1=未配置
}

export function computeChannelDelivery(input: ChannelDeliveryInput) {
  const warnings: string[] = [];
  const { channelEfficiency, reachRatio } = input;

  if (channelEfficiency < 0 || reachRatio < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无渠道数据 — channelEfficiency或reachRatio未配置'],
    };
  }

  const clampedEff = Math.max(0, Math.min(1, channelEfficiency));
  const clampedReach = Math.max(0, Math.min(1, reachRatio));

  const value = Math.round(clampedEff * clampedReach * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`channelEfficiency: ${clampedEff}`, `reachRatio: ${clampedReach}`],
    degraded: false,
    warnings,
  };
}
