/** profit-health aggregate — 利润健康哨兵。综合N个指标→1条Finding。V3.8 T3 */
import type { GraphStoreReader, SentinelManifest } from '../../../src/sentinel/sentinel-loader';
import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/profit-health');

export const profitHealthSentinel = {
  manifest: null as SentinelManifest | null,
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const findings: SentinelFinding[] = [];
    let finNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let usedTraversal = false;
    try {
      try { if (traversal) { const r = traversal.traverse([teamId], ['FUNDS']); if (r.nodes[0]) { finNodes = r.nodes; usedTraversal = true; } } } catch (err: unknown) { log.warn({ err, teamId }, '图遍历失败 — 降级到旧路径'); }
      if (!usedTraversal) { finNodes = store.queryNodes('Financial', { teamId }); }
      if (!finNodes[0]) { log.info({ teamId }, '无财务数据'); return []; }

      const revenue = finNodes.filter(n => n.props.financialType === 'revenue').reduce((s, n) => s + (Number(n.props.amount) || 0), 0);
      const cost = finNodes.filter(n => n.props.financialType === 'cost').reduce((s, n) => s + (Number(n.props.amount) || 0), 0);
      const profitMargin = revenue > 0 ? (revenue - cost) / revenue : 0;
      // 行业基准简单估算
      const benchmarkMargin = 0.25; // 通用基准25%
      const marginVsBenchmark = profitMargin - benchmarkMargin;

      if (this.manifest) {
        const t = this.manifest.thresholds;
        if (marginVsBenchmark <= t.margin_vs_benchmark.critical) {
          findings.push({ id: 'profit_bench_critical', severity: 'critical', title: '利润率严重低于行业基准', description: `利润率${(profitMargin*100).toFixed(1)}%，与行业基准差距${(Math.abs(marginVsBenchmark)*100).toFixed(0)}pp，超出critical阈值。`, evidence: [`收入: ${revenue}`, `成本: ${cost}`, `行业基准: ${(benchmarkMargin*100).toFixed(0)}%`], suggestion: '审查成本结构，寻找利润率改善机会。', detectedAt: new Date().toISOString() });
        } else if (marginVsBenchmark <= t.margin_vs_benchmark.warning) {
          findings.push({ id: 'profit_bench_warning', severity: 'warning', title: '利润率低于行业基准', description: `利润率${(profitMargin*100).toFixed(1)}%，低于行业基准${(benchmarkMargin*100).toFixed(0)}%。`, detectedAt: new Date().toISOString() });
        }
        if (profitMargin <= Math.abs(t.profit_margin_change.critical)) {
          findings.push({ id: 'profit_low_critical', severity: 'critical', title: '利润率过低', description: `利润率${(profitMargin*100).toFixed(1)}%，低于critical阈值。`, detectedAt: new Date().toISOString() });
        }
      }
      if (findings.length) log.info({ teamId, count: findings.length }, '利润健康检查完成');
    } catch (err: any) { log.warn({ err, teamId }, '利润健康检查失败'); }
    return findings;
  },
};
