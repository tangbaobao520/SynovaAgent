/**
 * compute-constraint-impact.ts — 外部约束影响分析
 *
 * 契约ID: COMPUTE-CONSTRAINT-IMPACT-v1
 * 模块: cash-runway
 * 消费边: CONSTRAINS
 * 输入: store, { teamId, traversal } — 通过 CONSTRAINS 边遍历获取外部约束
 * 输出(正常): { value: 最大约束magnitude(0-1), unit: '得分', confidence: 'medium',
 *               evidence: ['约束类型: regulatory', 'magnitude: 0.75'],
 *               degraded: false, warnings: [], computedAt }
 * 输出(降级): { value: 0, confidence: 'low', degraded: true, warnings: ['无约束数据'] }
 */
import type { GraphStoreReader } from '../../../../src/l4/graph-traversal';
import type { GraphTraversal } from '../../../../src/l4/graph-traversal';
import type { ComputeInput, ComputeOutput } from './compute-cash-runway-months';

export async function computeConstraintImpact(
  store: GraphStoreReader,
  input: ComputeInput,
): Promise<ComputeOutput<number>> {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();
  let maxMagnitude = 0;
  const constraints: string[] = [];

  try {
    if (input.traversal) {
      try {
        const result = input.traversal.traverse([input.teamId], ['CONSTRAINS']);
        if (result.edges.length > 0) {
          for (const edge of result.edges) {
            const mag = Number(edge.props.magnitude) || 0;
            if (mag > maxMagnitude) maxMagnitude = mag;
            constraints.push(`${edge.props.constraint_type || 'unknown'}:${mag.toFixed(2)}`);
          }
        }
      } catch (err: unknown) {
        warnings.push(`CONSTRAINS遍历失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (constraints.length === 0) {
      return {
        value: 0, confidence: 'low',
        evidence: [], degraded: true,
        warnings: ['无约束数据 — 无法计算约束影响'],
        computedAt,
      };
    }

    return {
      value: Math.round(maxMagnitude * 100) / 100,
      unit: '得分',
      confidence: 'medium',
      evidence: constraints.map(c => `约束: ${c}`),
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
