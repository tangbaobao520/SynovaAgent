/**
 * htm/computes/trust.ts — 混合信任模型 (Hybrid Trust Model)
 *
 * 理论依据: 评估人-ML 混合系统中信任水平的成熟度。
 * 从低到高：
 *   L0 — 完全不信任，人类重审所有 Agent 输出
 *   L1 — 有条件信任，低风险任务自动化
 *   L2 — 一般信任，常规任务自主执行
 *   L3 — 高度信任，Agent 参与决策
 *   L4 — 深度协作信任，Agent 与人类平级协作
 *
 * 参考: packages/engine-core/src/pipeline/diagnosis/htm.ts
 */

export interface HTMResult {
  value: number;       // 0-1, 信任成熟度得分
  threshold: 'ok' | 'warning' | 'critical';
  metadata: Record<string, unknown>;
}

interface GraphStoreLike {
  queryNodes(filter?: Record<string, unknown>): Promise<unknown[]>;
  queryEdges(filter?: Record<string, unknown>): Promise<unknown[]>;
}

export async function computeHTM(
  store: GraphStoreLike,
  _orgId: string,
): Promise<HTMResult> {
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

    // Analyze trust-indicating edges
    const verifiedEdges = edges.filter((e: Record<string, unknown>) =>
      (e.type as string)?.toLowerCase() === 'verification'
    );
    const delegationEdges = edges.filter((e: Record<string, unknown>) =>
      (e.type as string)?.toLowerCase() === 'delegation'
    );
    const overrideEdges = edges.filter((e: Record<string, unknown>) =>
      (e.type as string)?.toLowerCase() === 'human_override'
    );

    const totalTrustEdges = verifiedEdges.length + delegationEdges.length + overrideEdges.length;

    // Trust maturity: high delegation + verification = high trust
    // High override = low trust (humans overriding agent decisions)
    if (totalTrustEdges === 0) {
      return {
        value: 0.3,
        threshold: 'warning',
        metadata: {
          degraded: true,
          reason: 'no trust-related graph data',
          verifiedCount: 0,
          delegationCount: 0,
          overrideCount: 0,
        },
      };
    }

    const delegationWeight = delegationEdges.length / totalTrustEdges;
    const verificationWeight = verifiedEdges.length / totalTrustEdges;
    const overrideWeight = overrideEdges.length / totalTrustEdges;

    // Score: delegation + verification contribute positively, override negatively
    const trustScore = Math.max(0,
      delegationWeight * 0.6 + verificationWeight * 0.4 - overrideWeight * 0.5
    );

    const threshold: 'ok' | 'warning' | 'critical' =
      trustScore >= 0.6 ? 'ok'
      : trustScore >= 0.3 ? 'warning'
      : 'critical';

    return {
      value: Math.round(trustScore * 100) / 100,
      threshold,
      metadata: {
        delegationCount: delegationEdges.length,
        verificationCount: verifiedEdges.length,
        humanOverrideCount: overrideEdges.length,
        totalTrustEdges,
        trustLevel: trustScore >= 0.6 ? 'L3-L4' : trustScore >= 0.3 ? 'L1-L2' : 'L0',
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
