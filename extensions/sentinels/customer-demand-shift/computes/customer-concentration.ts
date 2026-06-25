/**
 * customer-demand-shift/computes/customer-concentration.ts — 客户集中度计算
 *
 * 评估客户收入集中度（最大客户占比）与营收分布。
 * 纯函数：输入客户列表，输出集中度指标。
 */
export interface ConcentrationResult {
  topCustomerShare: number;     // 最大客户营收占比
  topCustomerName: string;
  activeClientCount: number;
  totalRevenue: number;
  degraded: boolean;
}

export interface ClientRecord {
  name: string;
  revenue: number;
  status: string;
  churn: boolean;
}

export function computeCustomerConcentration(clients: ClientRecord[]): ConcentrationResult {
  const active = clients.filter(c => !c.churn);
  if (active.length === 0) {
    return { topCustomerShare: 0, topCustomerName: '', activeClientCount: 0, totalRevenue: 0, degraded: true };
  }

  const totalRevenue = active.reduce((s, c) => s + c.revenue, 0);
  const top = active.reduce((max, c) => c.revenue > max.revenue ? c : max, active[0]);
  const topCustomerShare = totalRevenue > 0 ? top.revenue / totalRevenue : 0;

  return { topCustomerShare, topCustomerName: top.name, activeClientCount: active.length, totalRevenue, degraded: false };
}
