/**
 * compute-fixed-variable-ratio.ts — 固定成本占比计算
 *
 * 契约ID: COMPUTE-FIXED-VARIABLE-RATIO-v1
 * 模块: cost-health
 * 消费边: FUNDS
 * 输入: store: GraphStoreReader — 通过 queryNodes 获取成本节点
 *       input: { teamId, traversal? }
 * 输出(正常): { value: number(固定成本占比0-1), confidence:'high',
 *               evidence:['固定成本: N', '总成本: N'], degraded:false, warnings:[], computedAt }
 * 输出(降级): { value:0, confidence:'low', degraded:true,
 *               warnings:['无成本数据'|'图遍历失败'] }
 * 边界: 总成本=0 → 0
 * 超时: 5秒。不抛异常。
 */
import type { GraphStoreReader } from '../../../src/l4/graph-traversal';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import type { ComputeInput, ComputeOutput } from './compute-gross-margin';

export async function computeFixedVariableRatio(
  store: GraphStoreReader,
  input: ComputeInput,
): Promise<ComputeOutput<number>> {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();
  let fixedCost = 0;
  let totalCost = 0;
  let hasData = false;

  try {
    if (input.traversal) {
      try {
        const result = input.traversal.traverse([input.teamId], ['FUNDS']);
        if (result.nodes[0]) {
          const costNodes = result.nodes.filter(n => (n.props.financialType as string) === 'cost' || n.props.total_cost);
          fixedCost = costNodes.reduce((s, n) => s + ((n.props.fixedAmount as number) || 0), 0);
          totalCost = costNodes.reduce((s, n) => s + (Number(n.props.amount) || Number(n.props.total_cost) || 0), 0);
          hasData = true;
        }
      } catch (err: unknown) {
        warnings.push(`图遍历失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!hasData) {
      const nodes = store.queryNodes('Financial', { [input.teamId]: input.teamId });
      if (nodes.length > 0) {
        const costNodes = nodes.filter(n => (n.props.financialType as string) === 'cost');
        fixedCost = costNodes.reduce((s, n) => s + ((n.props.fixedAmount as number) || 0), 0);
        totalCost = costNodes.reduce((s, n) => s + (Number(n.props.amount) || 0), 0);
        hasData = true;
      }
    }

    if (!hasData) {
      return {
        value: 0,
        confidence: 'low',
        evidence: [],
        degraded: true,
        warnings: ['无成本数据 — 无法计算固定成本占比'],
        computedAt,
      };
    }

    const fixedRatio = totalCost > 0 ? fixedCost / totalCost : 0;

    return {
      value: Math.round(fixedRatio * 10000) / 10000,
      confidence: 'high',
      evidence: [`固定成本: ${fixedCost}`, `总成本: ${totalCost}`],
      degraded: false,
      warnings,
      computedAt,
    };
  } catch (err: unknown) {
    return {
      value: 0,
      confidence: 'low',
      evidence: [],
      degraded: true,
      warnings: [`计算失败: ${err instanceof Error ? err.message : String(err)}`],
      computedAt,
    };
  }
}
