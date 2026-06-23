/**
 * FinancialSnapshot — 财务健康快照
 * 从 L4 GraphStore FINANCIAL 节点计算利润率、现金流、趋势、人均指标。零 engine-core import。
 */
import type { GraphStoreReader } from '../../../shared/baseline';

export async function computeFinancialSnapshot(store: GraphStoreReader, teamId: string): Promise<{ value: number; threshold: string; metadata: Record<string, unknown> }> {
  const financialNodes = store.queryNodes('Financial', { teamId });
  const persons = store.queryNodes('Person', { teamId });
  const headcount = persons.length || 1;

  // 提取财务数据
  let totalRevenue = 0, totalCost = 0, totalCashFlow = 0;
  let entryCount = 0;
  for (const node of financialNodes) {
    const ft = node.props.financialType as string;
    const amount = (node.props.amount as number) || 0;
    if (ft === 'revenue') totalRevenue += amount;
    if (ft === 'cost') totalCost += amount;
    if (ft === 'token_account') { totalCost += amount; continue; }
    entryCount++;
  }

  // 计算核心指标
  const grossMargin = totalRevenue > 0 ? (totalRevenue - totalCost) / totalRevenue : 0;
  const revenuePerHead = totalRevenue / headcount;
  const costPerHead = totalCost / headcount;

  const healthScore = grossMargin * 0.5 + (totalRevenue > 0 ? 0.5 : 0);

  return {
    value: healthScore,
    threshold: grossMargin < 0.1 ? 'critical' : grossMargin < 0.3 ? 'warning' : 'ok',
    metadata: {
      totalRevenue, totalCost, grossMargin, revenuePerHead, costPerHead,
      headcount, entryCount,
    },
  };
}
