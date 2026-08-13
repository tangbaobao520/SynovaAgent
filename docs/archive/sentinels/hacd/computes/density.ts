/**
 * hacd/computes/density.ts — 人机协作深度 (Human-Agent Collaboration Depth)
 *
 * 理论依据: 评估人+AI Agent 混合团队的协作深度水平。
 * 从完全人工(L0)到完全自主(L4)的五阶段模型：
 *   L0 — 全人工操作
 *   L1 — Agent 辅助建议
 *   L2 — Agent 部分执行
 *   L3 — Agent 自主执行+人类监督
 *   L4 — 完全自主
 *
 * 参考: packages/engine-core/src/pipeline/diagnosis/hacd.ts
 */

interface GraphStoreLike {
  queryNodes(filter?: Record<string, unknown>): Promise<unknown[]>;
  queryEdges(filter?: Record<string, unknown>): Promise<unknown[]>;
}

export interface HACDResult {
  value: number;       // 0-1, 协作深度得分
  threshold: 'ok' | 'warning' | 'critical';
  metadata: Record<string, unknown>;
}

export async function computeHACD(
  store: GraphStoreLike,
  _orgId: string,
): Promise<HACDResult> {
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

    // Analyze human-agent interaction edges
    const collaborationEdges = edges.filter((e: Record<string, unknown>) =>
      (e.type as string)?.toLowerCase().includes('collaboration')
    );
    const humanNodes = nodes.filter((n: Record<string, unknown>) =>
      (n.type as string)?.toLowerCase() === 'human'
    );
    const agentNodes = nodes.filter((n: Record<string, unknown>) =>
      (n.type as string)?.toLowerCase() === 'agent'
    );

    const totalPairs = humanNodes.length * agentNodes.length;
    const collaborationRatio = totalPairs > 0
      ? Math.min(collaborationEdges.length / totalPairs, 1)
      : 0;

    // Depth score: higher ratio → deeper collaboration
    const depth = collaborationRatio;

    const threshold: 'ok' | 'warning' | 'critical' =
      depth >= 0.7 ? 'ok'
      : depth >= 0.4 ? 'warning'
      : 'critical';

    return {
      value: Math.round(depth * 100) / 100,
      threshold,
      metadata: {
        humanCount: humanNodes.length,
        agentCount: agentNodes.length,
        collaborationEdgeCount: collaborationEdges.length,
        collaborationRatio: Math.round(collaborationRatio * 100) / 100,
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
