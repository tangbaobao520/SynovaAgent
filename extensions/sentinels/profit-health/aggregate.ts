/** profit-health aggregate — 利润健康哨兵。综合N个指标→1条Finding。V4.4.2 */
import type { GraphStoreReader, SentinelManifest } from '../../../src/sentinel/sentinel-loader';
import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { createLogger } from '@synova/logger';
import { computeProfitMarginChange } from './computes/compute-profit-margin-change';
import { computeMarginVsBenchmark } from './computes/compute-margin-vs-benchmark';

const log = createLogger('sentinel/profit-health');

export const profitHealthSentinel = {
  manifest: null as SentinelManifest | null,
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const findings: SentinelFinding[] = [];
    try {
      const [marginResult, benchmarkResult] = await Promise.all([
        computeProfitMarginChange(store, { teamId, traversal }),
        computeMarginVsBenchmark(store, { teamId, traversal }),
      ]);

      const profitMargin = marginResult.value;
      const marginVsBenchmark = benchmarkResult.gap;

      if (this.manifest) {
        const t = this.manifest.thresholds;
        if (marginVsBenchmark <= t.margin_vs_benchmark.critical) {
          findings.push({
            id: 'profit_bench_critical', severity: 'critical',
            title: '利润率严重低于行业基准',
            description: `利润率${(profitMargin * 100).toFixed(1)}%，与行业基准差距${(Math.abs(marginVsBenchmark) * 100).toFixed(0)}pp，超出critical阈值。`,
            evidence: [`收入: 已计算`, `成本: 已计算`, `行业基准: 25%`],
            suggestion: '审查成本结构，寻找利润率改善机会。',
            detectedAt: new Date().toISOString(),
          });
        } else if (marginVsBenchmark <= t.margin_vs_benchmark.warning) {
          findings.push({
            id: 'profit_bench_warning', severity: 'warning',
            title: '利润率低于行业基准',
            description: `利润率${(profitMargin * 100).toFixed(1)}%，低于行业基准25%。`,
            detectedAt: new Date().toISOString(),
          });
        }
        if (profitMargin <= Math.abs(t.profit_margin_change.critical)) {
          findings.push({
            id: 'profit_low_critical', severity: 'critical',
            title: '利润率过低',
            description: `利润率${(profitMargin * 100).toFixed(1)}%，低于critical阈值。`,
            detectedAt: new Date().toISOString(),
          });
        }
      }
      if (findings.length) log.info({ teamId, count: findings.length }, '利润健康检查完成');
    } catch (err: any) { log.warn({ err, teamId }, '利润健康检查失败'); }
    return findings;
  },
};
