/**
 * compute-incentive-bind.ts — 激励绑定/行为差距分析
 *
 * 契约ID: COMPUTE-INCENTIVE-BIND-v1
 * 模块: cost-health
 * 消费边: INCENTIVE_BINDS
 * 输入: store, { teamId, traversal } — 通过 INCENTIVE_BINDS 边遍历获取激励数据
 * 输出(正常): { value: 最大metric_behavior_gap(0-1), unit: '得分', confidence: 'medium',
 *               evidence: ['metric_behavior_gap: 0.45'],
 *               degraded: false, warnings: [], computedAt }
 * 输出(降级): { value: 0, confidence: 'low', degraded: true, warnings: ['无激励绑定数据'] }
 */
import type { GraphStoreReader } from '../../../../src/l4/graph-traversal';
import type { GraphTraversal } from '../../../../src/l4/graph-traversal';

interface IncentiveBindInput {
  teamId: string;
  traversal?: GraphTraversal;
}

interface IncentiveBindOutput {
  value: number;
  unit?: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  degraded: boolean;
  warnings: string[];
  computedAt: string;
}

export async function computeIncentiveBindGap(
  store: GraphStoreReader,
  input: IncentiveBindInput,
): Promise<IncentiveBindOutput> {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();
  let maxGap = 0;
  const gaps: string[] = [];

  try {
    if (input.traversal) {
      try {
        const result = input.traversal.traverse([input.teamId], ['INCENTIVE_BINDS']);
        if (result.edges.length > 0) {
          for (const edge of result.edges) {
            const gap = Number(edge.props.metric_behavior_gap) || 0;
            if (gap > maxGap) maxGap = gap;
            gaps.push(`gap:${gap.toFixed(2)}`);
          }
        }
      } catch (err: unknown) {
        warnings.push(`INCENTIVE_BINDS遍历失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (gaps.length === 0) {
      return {
        value: 0, confidence: 'low',
        evidence: [], degraded: true,
        warnings: ['无激励绑定数据 — 无法计算行为差距'],
        computedAt,
      };
    }

    return {
      value: Math.round(maxGap * 100) / 100,
      unit: '得分',
      confidence: 'medium',
      evidence: gaps.map(g => `行为差距: ${g}`),
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
