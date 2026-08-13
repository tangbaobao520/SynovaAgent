/**
 * compute-replenish-rate.ts — 资金回流/资源补充率计算
 *
 * 契约ID: COMPUTE-REPLENISH-RATE-v1
 * 模块: cash-runway
 * 消费边: REPLENISHES
 * 输入: store, { teamId, traversal } — 通过 REPLENISHES 边遍历获取回流数据
 * 输出(正常): { value: 平均再投资率(0-1), unit: '比率', confidence: 'medium',
 *               evidence: ['reinvestment_rate: 0.35'],
 *               degraded: false, warnings: [], computedAt }
 * 输出(降级): { value: 0, confidence: 'low', degraded: true, warnings: ['无回流数据'] }
 */
import type { GraphStoreReader } from '../../../../src/l4/graph-traversal';
import type { GraphTraversal } from '../../../../src/l4/graph-traversal';
import type { ComputeInput, ComputeOutput } from './compute-cash-runway-months';

export async function computeReplenishRate(
  store: GraphStoreReader,
  input: ComputeInput,
): Promise<ComputeOutput<number>> {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();
  let totalRate = 0;
  let edgeCount = 0;

  try {
    if (input.traversal) {
      try {
        const result = input.traversal.traverse([input.teamId], ['REPLENISHES']);
        if (result.edges.length > 0) {
          for (const edge of result.edges) {
            totalRate += Number(edge.props.reinvestment_rate) || 0;
            edgeCount++;
          }
        }
      } catch (err: unknown) {
        warnings.push(`REPLENISHES遍历失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (edgeCount === 0) {
      return {
        value: 0, confidence: 'low',
        evidence: [], degraded: true,
        warnings: ['无回流数据 — 无法计算资源补充率'],
        computedAt,
      };
    }

    const avgRate = totalRate / edgeCount;

    return {
      value: Math.round(avgRate * 100) / 100,
      unit: '比率',
      confidence: 'medium',
      evidence: [`reinvestment_rate: ${avgRate.toFixed(2)}`, `边数: ${edgeCount}`],
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
