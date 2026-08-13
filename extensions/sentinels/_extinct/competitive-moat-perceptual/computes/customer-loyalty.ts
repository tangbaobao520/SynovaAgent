/**
 * I4 护城河感知强度: 客户忠诚度评分
 *
 * 理论依据: Reichheld (1996) 忠诚度经济效应。NPS 和客户 tenure
 * 是护城河感知强度的核心代理变量。高 NPS + 长 tenure = 强转换壁垒。
 *
 * 评分方法:
 * - npsScore: NPS [-100,100] 归一化到 [0,1]
 * - tenureScore: 平均 tenure 月数, 60 月封顶
 * - loyalty = 0.6 × npsScore + 0.4 × tenureScore
 */
export interface LoyaltyResult {
  loyalty: number;
  repeatRate: number;
  avgTenure: number;
  degraded: boolean;
}

export function computeCustomerLoyalty(clients: Array<{ nps?: number; tenure?: number; revenue: number }>): LoyaltyResult {
  if (clients.length === 0) return { loyalty: 0, repeatRate: 0, avgTenure: 0, degraded: true };
  const avgNps = clients.reduce((s, c) => s + (c.nps || 0), 0) / clients.length;
  const avgTenure = clients.reduce((s, c) => s + (c.tenure || 0), 0) / clients.length;
  const npsScore = Math.max((avgNps + 100) / 200, 0);
  const tenureScore = Math.min(avgTenure / 60, 1);
  return {
    loyalty: Math.round((npsScore * 0.6 + tenureScore * 0.4) * 100) / 100,
    repeatRate: npsScore,
    avgTenure: Math.round(avgTenure),
    degraded: false,
  };
}
