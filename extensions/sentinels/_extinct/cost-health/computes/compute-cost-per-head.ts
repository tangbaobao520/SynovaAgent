/**
 * compute-cost-per-head.ts — 人均成本计算
 *
 * 契约ID: COMPUTE-COST-PER-HEAD-v1
 * 模块: cost-health
 * 消费边: FUNDS, OWNS
 * 输入: store: GraphStoreReader — 通过 queryNodes 获取财务和人员数据
 *       input: { teamId, traversal? }
 * 输出(正常): { value: number(人均成本), confidence:'high',
 *               evidence:['总成本: N', '人数: N'], degraded:false, warnings:[], computedAt }
 * 输出(降级): { value:0, confidence:'low', degraded:true,
 *               warnings:['无数据'|'图遍历失败'] }
 * 边界: 人数=0 → 0
 * 超时: 5秒。不抛异常。
 */
import type { GraphStoreReader } from '../../../src/l4/graph-traversal';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import type { ComputeInput, ComputeOutput } from './compute-gross-margin';

export async function computeCostPerHead(
  store: GraphStoreReader,
  input: ComputeInput,
): Promise<ComputeOutput<number>> {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();
  let totalCost = 0;
  let headCount = 0;
  let hasData = false;

  try {
    if (input.traversal) {
      try {
        const fundsResult = input.traversal.traverse([input.teamId], ['FUNDS']);
        const personResult = input.traversal.traverse([input.teamId], ['OWNS']);
        if (fundsResult.nodes[0] || personResult.nodes[0]) {
          const costNodes = fundsResult.nodes.filter(n => (n.props.financialType as string) === 'cost' || n.props.total_cost);
          totalCost = costNodes.reduce((s, n) => s + (Number(n.props.amount) || Number(n.props.total_cost) || 0), 0);
          headCount = personResult.nodes.filter(n => n.type === 'Person' || n.type === 'person').length;
          hasData = true;
        }
      } catch (err: unknown) {
        warnings.push(`图遍历失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!hasData) {
      const finNodes = store.queryNodes('Financial', { [input.teamId]: input.teamId });
      const personNodes = store.queryNodes('Person', { [input.teamId]: input.teamId });
      if (finNodes.length > 0 || personNodes.length > 0) {
        const costNodes = finNodes.filter(n => (n.props.financialType as string) === 'cost');
        totalCost = costNodes.reduce((s, n) => s + (Number(n.props.amount) || 0), 0);
        headCount = personNodes.length;
        hasData = true;
      }
    }

    if (!hasData) {
      return {
        value: 0,
        confidence: 'low',
        evidence: [],
        degraded: true,
        warnings: ['无成本或人员数据 — 无法计算人均成本'],
        computedAt,
      };
    }

    const costPerHead = headCount > 0 ? totalCost / headCount : 0;

    return {
      value: Math.round(costPerHead * 100) / 100,
      confidence: 'high',
      evidence: [`总成本: ${totalCost}`, `人数: ${headCount}`],
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
