/**
 * self-awareness/computes/bias.ts — 自知偏差 (Self-Awareness Bias)
 *
 * 理论依据: 评估组织自我认知偏差——成员自评与客观指标之间的差距。
 * 偏差大的组织倾向于高估自身能力，低估风险。
 * KPI:
 *   - bias = |self_assessment - objective_metric| / max_possible
 *   - bias < 0.2 = 高自知
 *   - bias 0.2-0.4 = 中等偏差
 *   - bias > 0.4 = 严重偏差
 *
 * 参考: packages/engine-core/src/pipeline/diagnosis/self-awareness.ts
 */

export interface BiasResult {
  value: number;       // 0-1, 偏差分(越低越好)
  threshold: 'ok' | 'warning' | 'critical';
  metadata: Record<string, unknown>;
}

interface GraphStoreLike {
  queryNodes(filter?: Record<string, unknown>): Promise<unknown[]>;
  queryEdges(filter?: Record<string, unknown>): Promise<unknown[]>;
}

export async function computeSelfAwareness(
  store: GraphStoreLike,
  _orgId: string,
): Promise<BiasResult> {
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

    // Find self-assessment vs objective-performance edges
    const selfAssessmentNodes = nodes.filter((n: Record<string, unknown>) =>
      (n.type as string)?.toLowerCase() === 'self_assessment' ||
      (n.labels as string[] || []).some((l: string) => l.toLowerCase().includes('assessment'))
    );

    const performanceNodes = nodes.filter((n: Record<string, unknown>) =>
      (n.type as string)?.toLowerCase() === 'performance_metric' ||
      (n.type as string)?.toLowerCase() === 'objective_metric'
    );

    // Compare assessment edges to find gaps
    let totalBias = 0;
    let comparisonCount = 0;

    for (const sa of selfAssessmentNodes as Array<Record<string, unknown>>) {
      const saValue = sa.value as number ?? sa.score as number ?? 0;
      const relatedEdges = edges.filter((e: Record<string, unknown>) =>
        e.source === sa.id || e.target === sa.id
      );

      for (const pe of performanceNodes as Array<Record<string, unknown>>) {
        const peValue = pe.value as number ?? pe.score as number ?? 0;
        const gap = Math.abs(saValue - peValue);
        totalBias += Math.min(gap, 1);
        comparisonCount++;
      }
    }

    const avgBias = comparisonCount > 0 ? totalBias / comparisonCount : 0.5;

    const threshold: 'ok' | 'warning' | 'critical' =
      avgBias <= 0.2 ? 'ok'
      : avgBias <= 0.4 ? 'warning'
      : 'critical';

    return {
      value: Math.round(avgBias * 100) / 100,
      threshold,
      metadata: {
        selfAssessmentCount: selfAssessmentNodes.length,
        performanceMetricCount: performanceNodes.length,
        comparisonCount,
        interpretation: avgBias <= 0.2 ? '高自知'
          : avgBias <= 0.4 ? '中等偏差'
          : '严重偏差',
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
