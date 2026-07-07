/** cash-runway aggregate — 现金流哨兵。综合N个指标→1条Finding。V4.4.2 */
import type { GraphStoreReader, SentinelManifest } from '../../../src/sentinel/sentinel-loader';
import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { createLogger } from '@synova/logger';
import { computeCashRunwayMonths } from './computes/compute-cash-runway-months';
import { computeReceivableOverdueRate } from './computes/compute-receivable-overdue-rate';

const log = createLogger('sentinel/cash-runway');

export const cashRunwaySentinel = {
  manifest: null as SentinelManifest | null,
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const findings: SentinelFinding[] = [];
    try {
      const [runwayResult, overdueResult] = await Promise.all([
        computeCashRunwayMonths(store, { teamId, traversal }),
        computeReceivableOverdueRate(store, { teamId, traversal }),
      ]);

      const runwayMonths = runwayResult.value;
      const overdueRate = overdueResult.value;

      if (this.manifest) {
        const t = this.manifest.thresholds;
        if (runwayMonths <= t.cash_runway_months.critical) {
          findings.push({
            id: 'cash_critical', severity: 'critical', title: `现金流危急—跑道${Number.isFinite(runwayMonths) ? runwayMonths.toFixed(1) : '充足'}个月`,
            description: `现金跑道${Number.isFinite(runwayMonths) ? runwayMonths.toFixed(1) : '充足'}个月，低于critical阈值${t.cash_runway_months.critical}个月。`,
            evidence: runwayResult.evidence,
            suggestion: runwayResult.degraded ? '请确认财务数据是否完整。' : '启动应急融资，削减非必要支出。',
            detectedAt: new Date().toISOString(),
          });
        } else if (runwayMonths <= t.cash_runway_months.warning) {
          findings.push({
            id: 'cash_warning', severity: 'warning', title: `现金流紧张—跑道${Number.isFinite(runwayMonths) ? runwayMonths.toFixed(1) : 0}个月`,
            description: `现金跑道${Number.isFinite(runwayMonths) ? runwayMonths.toFixed(1) : 0}个月，低于warning阈值。`,
            detectedAt: new Date().toISOString(),
          });
        }
        if (overdueRate >= t.receivable_overdue.critical) {
          findings.push({
            id: 'ar_critical', severity: 'critical', title: '应收逾期严重',
            description: `应收/现金比${(overdueRate * 100).toFixed(0)}%，超出critical阈值。`,
            evidence: overdueResult.evidence,
            suggestion: '加速应收回收，审查信用政策。',
            detectedAt: new Date().toISOString(),
          });
        }
      }
      if (findings.length) log.info({ teamId, count: findings.length }, '现金流检查完成');
    } catch (err: unknown) { log.warn({ err, teamId }, '现金流检查失败'); }
    return findings;
  },
};
