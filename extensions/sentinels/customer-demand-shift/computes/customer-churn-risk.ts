/**
 * customer-demand-shift/computes/customer-churn-risk.ts — 客户流失风险计算
 *
 * 评估客户流失率与满意度健康度。
 * 纯函数：输入客户列表，输出流失风险指标。
 */
export interface ChurnRiskResult {
  churnRate: number;              // 客户流失比例
  revenueChurnRate: number;       // 营收流失比例
  lowNpsCount: number;            // NPS<0 的客户数
  highValueAtRisk: string[];      // 高价值低满意度客户
  degraded: boolean;
}

export interface ClientNpsRecord {
  name: string;
  revenue: number;
  churn: boolean;
  nps?: number;
}

export function computeCustomerChurnRisk(clients: ClientNpsRecord[]): ChurnRiskResult {
  if (clients.length === 0) {
    return { churnRate: 0, revenueChurnRate: 0, lowNpsCount: 0, highValueAtRisk: [], degraded: true };
  }

  const churned = clients.filter(c => c.churn);
  const active = clients.filter(c => !c.churn);
  const totalRev = clients.reduce((s, c) => s + c.revenue, 0);
  const activeRev = active.reduce((s, c) => s + c.revenue, 0);

  const churnRate = churned.length / clients.length;
  const revenueChurnRate = totalRev > 0 ? (totalRev - activeRev) / totalRev : 0;
  const lowNpsCount = active.filter(c => c.nps !== undefined && c.nps < 0).length;
  const highValueAtRisk = active
    .filter(c => c.revenue > 0 && c.nps !== undefined && c.nps < 30 && c.revenue / Math.max(totalRev, 1) > 0.1)
    .map(c => c.name);

  return { churnRate, revenueChurnRate, lowNpsCount, highValueAtRisk, degraded: false };
}
