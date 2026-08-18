/**
 * compute-receivable-overdue-rate.ts — 应收账款逾期率计算
 *
 * 契约ID: COMPUTE-RECEIVABLE-OVERDUE-RATE-v1
 * 模块: cash-runway
 * 消费边: FUNDS, PRODUCES
 * 输入: store: GraphStoreReader — 通过 queryNodes 获取财务节点
 *       input: { teamId, traversal? }
 * 输出(正常): { value: number(比率0-1), unit:'比率', confidence:'high',
 *               evidence:['应收: N', '现金: N'],
 *               degraded:false, warnings:[], computedAt }
 * 输出(降级): { value:0, unit:'比率', confidence:'low', degraded:true,
 *               warnings:['无财务数据'|'图遍历失败'] }
 * 边界: 总现金=0 → 0 (无应收)
 * 超时: 5秒。不抛异常。
 */
import type { GraphStoreReader } from '../../../src/l4/graph-traversal';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import type { ComputeInput, ComputeOutput } from './compute-cash-runway-months';

export async function computeReceivableOverdueRate(
  store: GraphStoreReader,
  input: ComputeInput,
): Promise<ComputeOutput<number>> {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();
  let totalCash = 0;
  let receivable = 0;
  let hasData = false;

  try {
    if (input.traversal) {
      try {
        const result = input.traversal.traverse([input.teamId], ['FUNDS']);
        if (result.nodes[0]) {
          totalCash = result.nodes.reduce((s, n) => s + (Number(n.props.cash_balance) || Number(n.props.total_revenue) || 0), 0);
          receivable = result.nodes.reduce((s, n) => s + (Number(n.props.accounts_receivable) || 0), 0);
          hasData = true;
        }
      } catch (err: unknown) {
        warnings.push(`图遍历失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!hasData) {
      const nodes = store.queryNodes('Financial');
      if (nodes.length > 0) {
        totalCash = nodes.reduce((s, n) => s + (Number(n.props.cash) || 0), 0);
        receivable = nodes.reduce((s, n) => s + (Number(n.props.receivables) || 0), 0);
        hasData = true;
      }
    }

    if (!hasData) {
      return {
        value: 0,
        unit: '比率',
        confidence: 'low',
        evidence: [],
        degraded: true,
        warnings: ['无财务数据 — 无法计算应收逾期率'],
        computedAt,
      };
    }

    const overdueRate = totalCash > 0 ? receivable / totalCash : 0;

    return {
      value: Math.round(overdueRate * 100) / 100,
      unit: '比率',
      confidence: 'high',
      evidence: [`应收: ${receivable}`, `现金: ${totalCash}`],
      degraded: false,
      warnings,
      computedAt,
    };
  } catch (err: unknown) {
    return {
      value: 0,
      unit: '比率',
      confidence: 'low',
      evidence: [],
      degraded: true,
      warnings: [`计算失败: ${err instanceof Error ? err.message : String(err)}`],
      computedAt,
    };
  }
}
