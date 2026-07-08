/**
 * compute-cash-runway-months.ts — 现金跑道月数计算
 *
 * 契约ID: COMPUTE-CASH-RUNWAY-MONTHS-v1
 * 模块: cash-runway
 * 消费边: FUNDS
 * 输入: store: GraphStoreReader — 通过 FUNDS 边遍历获取现金流节点
 *       input: { teamId, traversal? }
 * 输出(正常): { value: number(月数), unit:'个月', confidence:'high',
 *               evidence:['总现金: N', '月消耗: N'],
 *               degraded:false, warnings:[], computedAt }
 * 输出(降级): { value:0, unit:'个月', confidence:'low', degraded:true,
 *               warnings:['无财务数据'|'图遍历失败'] }
 * 边界: 月消耗=0且总现金>0 → Infinity(充足); 两者=0 → 0
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
  unit?: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  degraded: boolean;
  warnings: string[];
  computedAt: string;
}

export async function computeCashRunwayMonths(
  store: GraphStoreReader,
  input: ComputeInput,
): Promise<ComputeOutput<number>> {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();
  let totalCash = 0;
  let monthlyBurn = 0;
  let hasData = false;

  try {
    if (input.traversal) {
      try {
        const result = input.traversal.traverse([input.teamId], ['FUNDS']);
        if (result.nodes[0]) {
          totalCash = result.nodes.reduce((s, n) => s + (Number(n.props.cash_balance) || Number(n.props.total_revenue) || 0), 0);
          monthlyBurn = result.nodes.reduce((s, n) => s + (Number(n.props.monthly_burn) || Number(n.props.total_cost) || 0), 0);
          hasData = true;
        }
      } catch (err: unknown) {
        warnings.push(`图遍历失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!hasData) {
      const nodes = store.queryNodes('Financial', { [input.teamId]: input.teamId });
      if (nodes.length > 0) {
        totalCash = nodes.reduce((s, n) => s + (Number(n.props.cashBalance) || 0), 0);
        monthlyBurn = nodes.reduce((s, n) => s + (Number(n.props.operatingExpenses) || Number(n.props.amount) || 0), 0);
        hasData = true;
      }
    }

    if (!hasData) {
      return {
        value: 0,
        unit: '个月',
        confidence: 'low',
        evidence: [],
        degraded: true,
        warnings: ['无财务数据 — 无法计算现金跑道'],
        computedAt,
      };
    }

    const runwayMonths = monthlyBurn > 0 ? totalCash / monthlyBurn : (totalCash > 0 ? Infinity : 0);
    const display = Number.isFinite(runwayMonths) ? Math.round(runwayMonths * 10) / 10 : Infinity;

    if (runwayMonths > 60) {
      warnings.push('跑道超过5年 — 请验证现金数据准确性');
    }

    return {
      value: display,
      unit: '个月',
      confidence: 'high',
      evidence: [`总现金: ${totalCash}`, `月消耗: ${monthlyBurn.toFixed(0)}`],
      degraded: false,
      warnings,
      computedAt,
    };
  } catch (err: unknown) {
    return {
      value: 0,
      unit: '个月',
      confidence: 'low',
      evidence: [],
      degraded: true,
      warnings: [`计算失败: ${err instanceof Error ? err.message : String(err)}`],
      computedAt,
    };
  }
}
