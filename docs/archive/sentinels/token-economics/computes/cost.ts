/**
 * token-economics/computes/cost.ts — 单位经济学 (Token Economics / Unit Economics)
 *
 * 理论依据: 分析单位经济的健康度。
 * 核心指标:
 *   - LTV/CAC > 3 = 健康
 *   - LTV/CAC 1-3 = 需关注
 *   - LTV/CAC < 1 = 不可持续
 * 辅助指标: 毛利率、回本周期、客户留存率
 *
 * 参考: packages/engine-core/src/pipeline/diagnosis/token-economics.ts
 */

export interface TokenEconomicsResult {
  value: number;       // 0-1, 单位经济健康度
  threshold: 'ok' | 'warning' | 'critical';
  metadata: Record<string, unknown>;
}

interface GraphStoreLike {
  queryNodes(filter?: Record<string, unknown>): Promise<unknown[]>;
  queryEdges(filter?: Record<string, unknown>): Promise<unknown[]>;
}

export async function computeTokenCost(
  store: GraphStoreLike,
  _orgId: string,
): Promise<TokenEconomicsResult> {
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

    // Extract financial metrics from graph nodes
    const customerNodes = nodes.filter((n: Record<string, unknown>) =>
      (n.type as string)?.toLowerCase() === 'customer' ||
      (n.type as string)?.toLowerCase() === 'client'
    );
    const revenueNodes = nodes.filter((n: Record<string, unknown>) =>
      (n.type as string)?.toLowerCase() === 'revenue' ||
      (n.type as string)?.toLowerCase() === 'financial'
    );

    // Compute LTV, CAC, and derived metrics
    let totalLtv = 0;
    let totalCac = 0;
    let customerCount = 0;

    for (const c of customerNodes as Array<Record<string, unknown>>) {
      const ltv = c.ltv as number ?? c.lifetime_value as number ?? 0;
      const cac = c.cac as number ?? c.acquisition_cost as number ?? 0;
      if (ltv > 0 || cac > 0) {
        totalLtv += ltv;
        totalCac += cac;
        customerCount++;
      }
    }

    let ltvCacRatio = 0;
    let healthScore = 0.5;

    if (customerCount > 0 && totalCac > 0) {
      ltvCacRatio = totalLtv / totalCac;
      // Normalize to 0-1: LTV/CAC of 5+ = 1.0, 0 = 0.0
      healthScore = Math.min(ltvCacRatio / 5, 1);
    }

    // Also factor in revenue growth if available
    if (revenueNodes.length >= 2) {
      const revArr = revenueNodes as Array<Record<string, unknown>>;
      const current = revArr[revArr.length - 1].amount as number ?? 0;
      const previous = revArr[revArr.length - 2].amount as number ?? 0;
      if (previous > 0) {
        const growth = (current - previous) / previous;
        // Boost health if growing
        healthScore = healthScore * 0.7 + Math.min(Math.max(growth, 0), 1) * 0.3;
      }
    }

    healthScore = Math.min(Math.max(healthScore, 0), 1);

    const threshold: 'ok' | 'warning' | 'critical' =
      healthScore >= 0.6 ? 'ok'
      : healthScore >= 0.3 ? 'warning'
      : 'critical';

    return {
      value: Math.round(healthScore * 100) / 100,
      threshold,
      metadata: {
        ltvCacRatio: Math.round(ltvCacRatio * 100) / 100,
        customerCount,
        totalLtv: Math.round(totalLtv),
        totalCac: Math.round(totalCac),
        revenueNodeCount: revenueNodes.length,
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
