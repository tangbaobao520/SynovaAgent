/** cash-runway aggregate — 现金流哨兵。综合N个指标→1条Finding。V3.8 T3 */
import type { GraphStoreReader, SentinelManifest } from '../../../src/sentinel/sentinel-loader';
import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/cash-runway');

export const cashRunwaySentinel = {
  manifest: null as SentinelManifest | null,
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const findings: SentinelFinding[] = [];
    try {
      let totalCash = 0;
      let monthlyBurn = 0;
      let receivable = 0;
      let hasData = false;

      // V4.3.0: 优先使用图遍历
      try {
        if (traversal) {
          const result = traversal.traverse([teamId], ['FUNDS']);
          if (result.nodes[0]) {
            totalCash = result.nodes.reduce((s, n) => s + (Number(n.props.cash_balance) || Number(n.props.total_revenue) || 0), 0);
            monthlyBurn = result.nodes.reduce((s, n) => s + (Number(n.props.monthly_burn) || Number(n.props.total_cost) || 0), 0);
            receivable = result.nodes.reduce((s, n) => s + (Number(n.props.accounts_receivable) || 0), 0);
            hasData = true;
          }
        }
      } catch (err: unknown) {
        log.warn({ err, teamId }, '图遍历失败 — 降级到旧路径');
      }

      // 降级: queryNodes 旧路径
      if (!hasData) {
        const nodes = store.queryNodes('Financial', { teamId });
        if (!nodes[0]) { log.info({ teamId }, '无财务数据'); return []; }
        totalCash = nodes.reduce((s, n) => s + (Number(n.props.cashBalance) || 0), 0);
        monthlyBurn = nodes.reduce((s, n) => s + (Number(n.props.operatingExpenses) || Number(n.props.amount) || 0), 0);
        receivable = nodes.reduce((s, n) => s + (Number(n.props.accountsReceivable) || 0), 0);
      }

      const runwayMonths = monthlyBurn > 0 ? totalCash / monthlyBurn : (totalCash > 0 ? Infinity : 0);
      const display = Number.isFinite(runwayMonths) ? `${runwayMonths.toFixed(1)}个月` : '充足';
      // 应收逾期率
      const overdueRate = totalCash > 0 ? receivable / totalCash : 0;

      if (this.manifest) {
        const t = this.manifest.thresholds;
        if (runwayMonths <= t.cash_runway_months.critical) {
          findings.push({ id: 'cash_critical', severity: 'critical', title: `现金流危急—跑道${display}`, description: `现金跑道${display}，低于critical阈值${t.cash_runway_months.critical}个月。`, evidence: [`总现金: ${totalCash}`, `月消耗: ${monthlyBurn.toFixed(0)}`], suggestion: '启动应急融资，削减非必要支出。', detectedAt: new Date().toISOString() });
        } else if (runwayMonths <= t.cash_runway_months.warning) {
          findings.push({ id: 'cash_warning', severity: 'warning', title: `现金流紧张—跑道${display}`, description: `现金跑道${display}，低于warning阈值。`, detectedAt: new Date().toISOString() });
        }
        if (overdueRate >= t.receivable_overdue.critical) {
          findings.push({ id: 'ar_critical', severity: 'critical', title: '应收逾期严重', description: `应收/现金比${(overdueRate*100).toFixed(0)}%，超出critical阈值。`, suggestion: '加速应收回收，审查信用政策。', detectedAt: new Date().toISOString() });
        }
      }
      if (findings.length) log.info({ teamId, count: findings.length }, '现金流检查完成');
    } catch (err: unknown) { log.warn({ err, teamId }, '现金流检查失败'); }
    return findings;
  },
};
