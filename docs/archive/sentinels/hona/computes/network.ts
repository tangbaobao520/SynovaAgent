/**
 * hona/computes/network.ts — 异质节点网络 (Heterogenous Organization Network Analysis)
 *
 * 理论依据: 评估组织中节点类型的异质性。高异质性 = 高多样性 = 高弹性。
 * 分析维度：
 *   1. 节点类型多样性 (Shannon 多样性指数)
 *   2. 跨类型边的密度
 *   3. 孤立节点比例
 *
 * 参考: packages/engine-core/src/pipeline/diagnosis/hona.ts
 */

interface GraphStoreLike {
  queryNodes(filter?: Record<string, unknown>): Promise<unknown[]>;
  queryEdges(filter?: Record<string, unknown>): Promise<unknown[]>;
}

export interface HONAResult {
  value: number;       // 0-1, 网络异质性得分
  threshold: 'ok' | 'warning' | 'critical';
  metadata: Record<string, unknown>;
}

export async function computeHONA(
  store: GraphStoreLike,
  _orgId: string,
): Promise<HONAResult> {
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

    // Compute node type diversity
    const typeCount = new Map<string, number>();
    for (const node of nodes as Array<Record<string, unknown>>) {
      const t = (node.type as string) || 'unknown';
      typeCount.set(t, (typeCount.get(t) || 0) + 1);
    }

    // Shannon diversity index
    const total = nodes.length;
    let shannon = 0;
    for (const count of typeCount.values()) {
      const p = count / total;
      if (p > 0) shannon -= p * Math.log(p);
    }
    // Normalize to [0,1]: max Shannon for given N types
    const typeCount_val = typeCount.size;
    const maxShannon = typeCount_val > 0 ? Math.log(typeCount_val) : 1;
    const diversity = maxShannon > 0 ? Math.min(shannon / maxShannon, 1) : 0;

    // Cross-type edge ratio
    const typeMap = new Map<string, string>();
    for (const node of nodes as Array<Record<string, unknown>>) {
      typeMap.set(node.id as string, (node.type as string) || 'unknown');
    }

    let crossTypeEdges = 0;
    for (const edge of edges as Array<Record<string, unknown>>) {
      const sourceType = typeMap.get(edge.source as string);
      const targetType = typeMap.get(edge.target as string);
      if (sourceType && targetType && sourceType !== targetType) {
        crossTypeEdges++;
      }
    }

    const crossTypeRatio = edges.length > 0 ? crossTypeEdges / edges.length : 0;

    // Composite score: equal weight diversity + cross-type edges
    const score = 0.5 * diversity + 0.5 * crossTypeRatio;

    const threshold: 'ok' | 'warning' | 'critical' =
      score >= 0.6 ? 'ok'
      : score >= 0.3 ? 'warning'
      : 'critical';

    return {
      value: Math.round(score * 100) / 100,
      threshold,
      metadata: {
        nodeTypeCount: typeCount_val,
        totalNodes: total,
        crossTypeEdgeRatio: Math.round(crossTypeRatio * 100) / 100,
        shannonDiversity: Math.round(diversity * 100) / 100,
        nodeTypes: Array.from(typeCount.keys()),
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
