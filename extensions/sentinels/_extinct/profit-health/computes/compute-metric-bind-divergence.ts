/**
 * compute-metric-bind-divergence.ts — KPI与现金流偏离检测
 *
 * 契约ID: COMPUTE-METRIC-BIND-DIVERGENCE-v1
 * 模块: profit-health
 * 消费边: METRIC_BINDS
 * 输入: store, { teamId, traversal } — 通过 METRIC_BINDS 边遍历获取KPI绑定数据
 * 输出(正常): { value: 最大divergence(0-1), unit: '得分', confidence: 'medium',
 *               evidence: ['divergence_from_cash: 0.35'],
 *               degraded: false, warnings: [], computedAt }
 * 输出(降级): { value: 0, confidence: 'low', degraded: true, warnings: ['无度量绑定数据'] }
 */
import type { GraphStoreReader } from '../../../../src/l4/graph-traversal';
import type { GraphTraversal } from '../../../../src/l4/graph-traversal';

interface MetricBindInput {
  teamId: string;
  traversal?: GraphTraversal;
}

interface MetricBindOutput {
  value: number;
  unit?: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  degraded: boolean;
  warnings: string[];
  computedAt: string;
}

export async function computeMetricBindDivergence(
  store: GraphStoreReader,
  input: MetricBindInput,
): Promise<MetricBindOutput> {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();
  let maxDivergence = 0;
  const divergences: string[] = [];

  try {
    if (input.traversal) {
      try {
        const result = input.traversal.traverse([input.teamId], ['METRIC_BINDS']);
        if (result.edges.length > 0) {
          for (const edge of result.edges) {
            const div = Number(edge.props.divergence_from_cash) || 0;
            if (div > maxDivergence) maxDivergence = div;
            const mt = edge.props.metric_type || 'unknown';
            divergences.push(`${mt}:${div.toFixed(2)}`);
          }
        }
      } catch (err: unknown) {
        warnings.push(`METRIC_BINDS遍历失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (divergences.length === 0) {
      return {
        value: 0, confidence: 'low',
        evidence: [], degraded: true,
        warnings: ['无度量绑定数据 — 无法计算KPI偏离'],
        computedAt,
      };
    }

    return {
      value: Math.round(maxDivergence * 100) / 100,
      unit: '得分',
      confidence: 'medium',
      evidence: divergences.map(d => `偏离: ${d}`),
      degraded: false,
      warnings,
      computedAt,
    };
  } catch (err: unknown) {
    return {
      value: 0, confidence: 'low',
      evidence: [], degraded: true,
      warnings: [`计算失败: ${err instanceof Error ? err.message : String(err)}`],
      computedAt,
    };
  }
}
