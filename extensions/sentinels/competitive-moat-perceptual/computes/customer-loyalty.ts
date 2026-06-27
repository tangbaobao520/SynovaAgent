export interface LoyaltyResult { loyalty: number; repeatRate: number; avgTenure: number; degraded: boolean; }
export function computeCustomerLoyalty(clients: Array<{ nps?: number; tenure?: number; revenue: number }>): LoyaltyResult {
  if (clients.length === 0) return { loyalty: 0, repeatRate: 0, avgTenure: 0, degraded: true };
  const avgNps = clients.reduce((s, c) => s + (c.nps || 0), 0) / clients.length;
  const avgTenure = clients.reduce((s, c) => s + (c.tenure || 0), 0) / clients.length;
  const npsScore = Math.max((avgNps + 100) / 200, 0);
  const tenureScore = Math.min(avgTenure / 60, 1);
  return { loyalty: Math.round((npsScore * 0.6 + tenureScore * 0.4) * 100) / 100, repeatRate: npsScore, avgTenure: Math.round(avgTenure), degraded: false };
}
