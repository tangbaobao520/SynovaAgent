/**
 * compute-margin-vs-benchmark.ts — 利润率与行业基准对比
 *
 * 契约ID: COMPUTE-MARGIN-VS-BENCHMARK-v1
 * 模块: profit-health
 * 消费边: FUNDS
 * 输入: store: GraphStoreReader — 通过 queryNodes 获取财务节点
 *       input: { teamId, traversal?, benchmark?: number }
 * 输出(正常): { value: number(与基准差距), confidence:'high',
 *               evidence:['利润率: N', '行业基准: N'], degraded:false, warnings:[], computedAt }
 * 输出(降级): { value:0, confidence:'low', degraded:true,
 *               warnings:['无财务数据'] }
 * 默认基准: 25% (通用基准)
 * 超时: 5秒。不抛异常。
 */
import type { GraphStoreReader } from '../../../src/l4/graph-traversal';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';

export interface BenchmarkInput {
  teamId: string;
  traversal?: GraphTraversal;
  /** 行业基准利润率, 默认 0.25 (25%) */
  benchmark?: number;
}

export interface BenchmarkOutput {
  /** 实际利润率 */
  profitMargin: number;
  /** 与基准的差距 (margin - benchmark) */
  gap: number;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  degraded: boolean;
  warnings: string[];
  computedAt: string;
}

export async function computeMarginVsBenchmark(
  store: GraphStoreReader,
  input: BenchmarkInput,
): Promise<BenchmarkOutput> {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();
  const benchmark = input.benchmark ?? 0.25;
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
        profitMargin: 0,
        gap: -benchmark,
        confidence: 'low',
        evidence: [],
        degraded: true,
        warnings: ['无财务数据 — 无法计算利润率对比'],
        computedAt,
      };
    }

    const profitMargin = revenue > 0 ? (revenue - cost) / revenue : 0;
    const gap = profitMargin - benchmark;

    return {
      profitMargin: Math.round(profitMargin * 10000) / 10000,
      gap: Math.round(gap * 10000) / 10000,
      confidence: 'high',
      evidence: [`利润率: ${(profitMargin * 100).toFixed(1)}%`, `行业基准: ${(benchmark * 100).toFixed(0)}%`],
      degraded: false,
      warnings,
      computedAt,
    };
  } catch (err: unknown) {
    return {
      profitMargin: 0,
      gap: -benchmark,
      confidence: 'low',
      evidence: [],
      degraded: true,
      warnings: [`计算失败: ${err instanceof Error ? err.message : String(err)}`],
      computedAt,
    };
  }
}
