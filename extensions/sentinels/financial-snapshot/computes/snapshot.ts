/**
 * financial-snapshot/computes/snapshot.ts — 财务快照 (Financial Snapshot)
 *
 * 理论依据: 汇总关键财务指标的快照视图。
 * 分析维度:
 *   1. 营收健康度 — 收入水平和趋势
 *   2. 成本效率 — 成本占收入比
 *   3. 利润质量 — 利润率
 *   4. 流动性 — 现金流
 *   5. 杠杆 — 资产负债率
 *
 * 参考: packages/engine-core/src/pipeline/diagnosis/financial-snapshot.ts
 */

export interface FinancialSnapshotResult {
  value: number;       // 0-1, 综合财务健康度
  threshold: 'ok' | 'warning' | 'critical';
  metadata: Record<string, unknown>;
}

interface GraphStoreLike {
  queryNodes(filter?: Record<string, unknown>): Promise<unknown[]>;
  queryEdges(filter?: Record<string, unknown>): Promise<unknown[]>;
}

export async function computeFinancialSnapshot(
  store: GraphStoreLike,
  _orgId: string,
): Promise<FinancialSnapshotResult> {
  try {
    const nodes = await store.queryNodes().catch(() => []);
    const edges = await store.queryEdges().catch(() => []);

    if (!Array.isArray(nodes) || nodes.length === 0) {
      return {
        value: 0.5,
        threshold: 'warning',
        metadata: {
          degraded: true,
          reason: 'no graph data available',
          nodeCount: 0,
          edgeCount: 0,
        },
      };
    }

    const nodeArr = nodes as Array<Record<string, unknown>>;

    // Categorize financial nodes
    const revenueNodes = nodeArr.filter(n =>
      (n.type as string)?.toLowerCase().includes('revenue') ||
      (n.category as string)?.toLowerCase() === 'revenue'
    );
    const costNodes = nodeArr.filter(n =>
      (n.type as string)?.toLowerCase().includes('cost') ||
      (n.type as string)?.toLowerCase().includes('expense') ||
      (n.category as string)?.toLowerCase() === 'cost'
    );
    const cashNodes = nodeArr.filter(n =>
      (n.type as string)?.toLowerCase().includes('cash') ||
      (n.type as string)?.toLowerCase() === 'cash_flow'
    );
    const assetNodes = nodeArr.filter(n =>
      (n.type as string)?.toLowerCase().includes('asset')
    );
    const liabilityNodes = nodeArr.filter(n =>
      (n.type as string)?.toLowerCase().includes('liability') ||
      (n.type as string)?.toLowerCase().includes('debt')
    );

    // Compute sub-scores
    const totalRevenue = revenueNodes.reduce((s, n) => s + ((n.amount as number) || 0), 0);
    const totalCost = costNodes.reduce((s, n) => s + ((n.amount as number) || 0), 0);
    const totalCash = cashNodes.reduce((s, n) => s + ((n.amount as number) || 0), 0);
    const totalAssets = assetNodes.reduce((s, n) => s + ((n.amount as number) || 0), 0);
    const totalLiabilities = liabilityNodes.reduce((s, n) => s + ((n.amount as number) || 0), 0);

    // Revenue health: more revenue nodes = diverse revenue
    const revenueHealth = revenueNodes.length > 0
      ? Math.min(revenueNodes.length / 3, 1)
      : 0.3;

    // Cost efficiency: lower cost ratio = better
    const costEfficiency = totalRevenue > 0 && totalCost > 0
      ? Math.max(1 - totalCost / totalRevenue, 0)
      : 0.5;

    // Liquidity: cash relative to cost
    const liquidity = totalCost > 0
      ? Math.min(totalCash / (totalCost * 3), 1)
      : 0.5;

    // Leverage: lower debt ratio = better
    const leverage = totalAssets > 0
      ? Math.max(1 - totalLiabilities / totalAssets, 0)
      : 0.5;

    // Composite score (equal weight)
    const healthScore = 0.25 * revenueHealth + 0.25 * costEfficiency
      + 0.25 * liquidity + 0.25 * leverage;

    const threshold: 'ok' | 'warning' | 'critical' =
      healthScore >= 0.6 ? 'ok'
      : healthScore >= 0.35 ? 'warning'
      : 'critical';

    return {
      value: Math.round(healthScore * 100) / 100,
      threshold,
      metadata: {
        revenueHealth: Math.round(revenueHealth * 100) / 100,
        costEfficiency: Math.round(costEfficiency * 100) / 100,
        liquidity: Math.round(liquidity * 100) / 100,
        leverage: Math.round(leverage * 100) / 100,
        revenueNodeCount: revenueNodes.length,
        costNodeCount: costNodes.length,
        cashNodeCount: cashNodes.length,
      },
    };
  } catch (err) {
    return {
      value: 0,
      threshold: 'critical',
      metadata: { degraded: true, error: String(err) },
    };
  }
}
