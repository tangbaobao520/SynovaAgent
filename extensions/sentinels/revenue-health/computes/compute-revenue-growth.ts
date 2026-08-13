/**
 * compute-revenue-growth.ts — 收入增长率计算
 *
 * 契约ID: COMPUTE-REVENUE-GROWTH-v1
 * 模块: revenue-health
 * 消费边: FUNDS
 * 输入: store: GraphStoreReader — 通过 queryNodes 获取多期收入数据对比
 *       input: { teamId, traversal? }
 * 输出(正常): { value: number(增长率, 可正可负), confidence:'high',
 *               evidence:['当期: N', '上期: N'], degraded:false, warnings:[], computedAt }
 * 输出(降级): { value:0, confidence:'low', degraded:true,
 *               warnings:['无收入数据'|'图遍历失败'] }
 * 边界: 仅有当期无上期 → value=0, warnings=['仅有单期数据']
 * 超时: 5秒。不抛异常。
 */
import type { GraphStoreReader } from '../../../src/l4/graph-traversal';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';

export interface RevenueInput {
  teamId: string;
  traversal?: GraphTraversal;
}

export interface RevenueOutput {
  value: number;
  totalRevenue: number;
  previousRevenue: number;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  degraded: boolean;
  warnings: string[];
  computedAt: string;
}

export async function computeRevenueGrowth(
  store: GraphStoreReader,
  input: RevenueInput,
): Promise<RevenueOutput> {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();
  let revenueNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
  let hasData = false;

  try {
    if (input.traversal) {
      try {
        const result = input.traversal.traverse([input.teamId], ['FUNDS', 'OPERATIONAL_EXECUTION']);
        if (result.nodes[0]) {
          revenueNodes = result.nodes.filter(n => n.props.financialType === 'revenue' || n.props.total_revenue);
          hasData = true;
        }
      } catch (err: unknown) {
        warnings.push(`图遍历失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!hasData) {
      const nodes = store.queryNodes('Financial', { [input.teamId]: input.teamId });
      if (nodes.length > 0) {
        revenueNodes = nodes.filter(n => n.props.financialType === 'revenue');
        hasData = true;
      }
    }

    if (!hasData) {
      return {
        value: 0,
        totalRevenue: 0,
        previousRevenue: 0,
        confidence: 'low',
        evidence: [],
        degraded: true,
        warnings: ['无收入数据 — 无法计算增长率'],
        computedAt,
      };
    }

    const totalRevenue = revenueNodes.reduce((s, n) => s + (Number(n.props.amount) || Number(n.props.total_revenue) || 0), 0);
    const prev = revenueNodes.length > 1 ? Number(revenueNodes[revenueNodes.length - 2]?.props.amount || 0) : 0;
    const growth = prev > 0 ? (totalRevenue - prev) / prev : 0;

    if (revenueNodes.length <= 1) {
      warnings.push('仅有单期收入数据 — 使用零增长率');
    }

    return {
      value: Math.round(growth * 10000) / 10000,
      totalRevenue,
      previousRevenue: prev,
      confidence: revenueNodes.length > 1 ? 'high' : 'medium',
      evidence: [`当期: ${totalRevenue}`, `上期: ${prev}`],
      degraded: false,
      warnings,
      computedAt,
    };
  } catch (err: unknown) {
    return {
      value: 0,
      totalRevenue: 0,
      previousRevenue: 0,
      confidence: 'low',
      evidence: [],
      degraded: true,
      warnings: [`计算失败: ${err instanceof Error ? err.message : String(err)}`],
      computedAt,
    };
  }
}
