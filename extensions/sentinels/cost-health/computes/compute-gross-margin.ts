/**
 * compute-gross-margin.ts — 毛利率计算
 *
 * 契约ID: COMPUTE-GROSS-MARGIN-v1
 * 模块: cost-health
 * 消费边: FUNDS
 * 输入: store: GraphStoreReader — 通过 FUNDS 边遍历获取财务节点(revenue, cost)
 *       input: { teamId, traversal? }
 * 输出(正常): { value: number(毛利率0-1), confidence:'high',
 *               evidence:['收入: N', '成本: N'], degraded:false, warnings:[], computedAt }
 * 输出(降级): { value:0, confidence:'low', degraded:true,
 *               warnings:['无财务数据'|'图遍历失败'] }
 * 边界: 收入=0且成本=0 → 0
 * 超时: 5秒。不抛异常。
 */
import type { GraphStoreReader } from '../../../src/l4/graph-traversal';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';

export interface ComputeInput {
  teamId: string;
  traversal?: GraphTraversal;
}

export interface ComputeOutput<T> {
  value: T;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  degraded: boolean;
  warnings: string[];
  computedAt: string;
}

export async function computeGrossMargin(
  store: GraphStoreReader,
  input: ComputeInput,
): Promise<ComputeOutput<number>> {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();
  let revenue = 0;
  let cost = 0;
  let hasData = false;

  try {
    if (input.traversal) {
      try {
        const result = input.traversal.traverse([input.teamId], ['FUNDS']);
        if (result.nodes[0]) {
          const revNodes = result.nodes.filter(n => (n.props.financialType as string) === 'revenue' || n.props.total_revenue);
          const costNodes = result.nodes.filter(n => (n.props.financialType as string) === 'cost' || n.props.total_cost);
          revenue = revNodes.reduce((s, n) => s + (Number(n.props.amount) || Number(n.props.total_revenue) || 0), 0);
          cost = costNodes.reduce((s, n) => s + (Number(n.props.amount) || Number(n.props.total_cost) || 0), 0);
          hasData = true;
        }
      } catch (err: unknown) {
        warnings.push(`图遍历失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!hasData) {
      const nodes = store.queryNodes('Financial', { [input.teamId]: input.teamId });
      if (nodes.length > 0) {
        const revNodes = nodes.filter(n => (n.props.financialType as string) === 'revenue');
        const costNodes = nodes.filter(n => (n.props.financialType as string) === 'cost');
        revenue = revNodes.reduce((s, n) => s + (Number(n.props.amount) || 0), 0);
        cost = costNodes.reduce((s, n) => s + (Number(n.props.amount) || 0), 0);
        hasData = true;
      }
    }

    if (!hasData) {
      return {
        value: 0,
        confidence: 'low',
        evidence: [],
        degraded: true,
        warnings: ['无财务数据 — 无法计算毛利率'],
        computedAt,
      };
    }

    const grossMargin = revenue > 0 ? (revenue - cost) / revenue : 0;

    return {
      value: Math.round(grossMargin * 10000) / 10000,
      confidence: 'high',
      evidence: [`收入: ${revenue}`, `成本: ${cost}`],
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
