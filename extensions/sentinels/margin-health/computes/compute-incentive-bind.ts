/**
 * margin-health/computes/compute-incentive-bind.ts — 激励绑定/行为差距分析（D358 迁自 _extinct/cost-health）
 *
 * 契约ID: COMPUTE-INCENTIVE-BIND-v1（迁移版 — store-based 保持）
 * 数据源: INCENTIVE_BINDS 边 props（非 Financial 节点 props，归一化不适用）
 * 输入: store, { teamId, traversal } — 通过 INCENTIVE_BINDS 边遍历获取激励数据
 * 输出(正常): { value: 最大 metric_behavior_gap(0-1), unit: '得分', confidence: 'medium',
 *               evidence: ['行为差距: gap:0.45'], degraded: false, warnings: [], computedAt }
 * 输出(降级): 无边 / 遍历失败 → { value: 0, confidence: 'low', degraded: true, warnings: [...] }
 * 边界: gap 显式 0 的边计入（value=0 但发现数据，不降级）
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
