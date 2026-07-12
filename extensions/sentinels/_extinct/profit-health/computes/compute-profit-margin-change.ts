/**
 * compute-profit-margin-change.ts — 利润率变化计算
 *
 * 契约ID: COMPUTE-PROFIT-MARGIN-CHANGE-v1
 * 模块: profit-health
 * 消费边: FUNDS
 * 输入: store: GraphStoreReader — 通过 FUNDS 边遍历获取 revenue/cost 节点
 *       input: { teamId, traversal? }
 * 输出(正常): { value: number(利润率0-1), confidence:'high',
 *               evidence:['收入: N', '成本: N'], degraded:false, warnings:[], computedAt }
 * 输出(降级): { value:0, confidence:'low', degraded:true,
 *               warnings:['无财务数据'|'图遍历失败'] }
 * 边界: 收入=0 → 0
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

export async function computeProfitMarginChange(
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
          revenue = result.nodes.filter(n => n.props.financialType === 'revenue').reduce((s, n) => s + (Number(n.props.amount) || 0), 0);
          cost = result.nodes.filter(n => n.props.financialType === 'cost').reduce((s, n) => s + (Number(n.props.amount) || 0), 0);
          hasData = true;
        }
      } catch (err: unknown) {
        warnings.push(`图遍历失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!hasData) {
      const nodes = store.queryNodes('Financial', { [input.teamId]: input.teamId });
      if (nodes.length > 0) {
        revenue = nodes.filter(n => n.props.financialType === 'revenue').reduce((s, n) => s + (Number(n.props.amount) || 0), 0);
        cost = nodes.filter(n => n.props.financialType === 'cost').reduce((s, n) => s + (Number(n.props.amount) || 0), 0);
        hasData = true;
      }
    }

    if (!hasData) {
      return {
        value: 0,
        confidence: 'low',
        evidence: [],
        degraded: true,
        warnings: ['无财务数据 — 无法计算利润率'],
        computedAt,
      };
    }

    const profitMargin = revenue > 0 ? (revenue - cost) / revenue : 0;

    return {
      value: Math.round(profitMargin * 10000) / 10000,
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
