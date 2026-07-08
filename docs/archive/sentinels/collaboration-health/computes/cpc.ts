/**
 * collaboration-health/computes/cpc.ts — 协作协议完备性 (Collaboration Protocol Completeness)
 *
 * 理论依据: 检查 6 个协作维度的协议覆盖度：
 *   1. 分工 (division) — 角色和责任定义
 *   2. 信息流 (information_flow) — 沟通渠道和频率
 *   3. 权限 (authorization) — 访问控制和权限管理
 *   4. 信任 (trust) — 信任建立机制
 *   5. 知识 (knowledge) — 知识共享方式
 *   6. 外部接口 (external_interface) — 跨组织协作
 *
 * 参考: packages/engine-core/src/pipeline/diagnosis/cpc.ts
 */

export interface CPCResult {
  value: number;
  threshold: 'ok' | 'warning' | 'critical';
  metadata: Record<string, unknown>;
}

interface GraphStoreLike {
  queryNodes(filter?: Record<string, unknown>): Promise<unknown[]>;
  queryEdges(filter?: Record<string, unknown>): Promise<unknown[]>;
}

const CPC_DIMENSIONS = [
  'division', 'information_flow', 'authorization',
  'trust', 'knowledge', 'external_interface',
];

export async function computeCPC(
  store: GraphStoreLike,
  _orgId: string,
): Promise<CPCResult> {
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

    // Check coverage by dimension: count edges per protocol dimension
    const coveredDims = new Set<string>();
    const dimDetails: Record<string, number> = {};

    for (const dim of CPC_DIMENSIONS) {
      const dimEdges = edges.filter((e: Record<string, unknown>) =>
        (e.type as string)?.toLowerCase() === dim ||
        (e.dimension as string)?.toLowerCase() === dim
      );
      dimDetails[dim] = dimEdges.length;
      if (dimEdges.length > 0) coveredDims.add(dim);
    }

    const coverageRatio = coveredDims.size / CPC_DIMENSIONS.length;

    const threshold: 'ok' | 'warning' | 'critical' =
      coverageRatio >= 0.67 ? 'ok'
      : coverageRatio >= 0.33 ? 'warning'
      : 'critical';

    return {
      value: Math.round(coverageRatio * 100) / 100,
      threshold,
      metadata: {
        coveredDimensions: Array.from(coveredDims),
        missingDimensions: CPC_DIMENSIONS.filter(d => !coveredDims.has(d)),
        dimensionEdgeCounts: dimDetails,
        totalEdges: edges.length,
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
