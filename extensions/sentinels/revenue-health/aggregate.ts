/** revenue-health aggregate — 收入健康哨兵。综合N个指标→1条Finding。V3.8 T3 */
import type { GraphStoreReader, SentinelManifest } from '../../../src/sentinel/sentinel-loader';
import type { SentinelFinding } from '../../../src/sentinel/types';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/revenue-health');

export const revenueHealthSentinel = {
  manifest: null as SentinelManifest | null,
  async check(store: GraphStoreReader, teamId: string): Promise<SentinelFinding[]> {
    const findings: SentinelFinding[] = [];
    try {
      const nodes = store.queryNodes('Financial', { teamId });
      const revenueNodes = nodes.filter(n => n.props.financialType === 'revenue');
      if (revenueNodes.length === 0) { log.info({ teamId }, '无收入数据'); return []; }

      const totalRevenue = revenueNodes.reduce((s, n) => s + (Number(n.props.amount) || 0), 0);
      // 客户集中度: CLIENT 节点数 vs FINANCIAL revenue 来源数
      const clients = store.queryNodes('Client', { teamId });
      const cr5 = clients.length > 0 ? Math.min(1, clients.length / 5) : 0; // 简化CR5估算

      if (this.manifest) {
        const t = this.manifest.thresholds;
        if (cr5 >= t.customer_concentration.critical) {
          findings.push({ id: 'rev_conc_critical', severity: 'critical', title: '客户集中度过高', description: `CR5估算${(cr5*100).toFixed(0)}%，超出critical阈值。收入过于依赖少数客户。`, evidence: [`客户数: ${clients.length}`, `收入来源: ${revenueNodes.length}`], suggestion: '拓展客户基础，降低单客户依赖。', detectedAt: new Date().toISOString() });
        } else if (cr5 >= t.customer_concentration.warning) {
          findings.push({ id: 'rev_conc_warning', severity: 'warning', title: '客户集中度偏高', description: `CR5估算${(cr5*100).toFixed(0)}%，超出warning阈值。`, detectedAt: new Date().toISOString() });
        }
        // 收入增长率: 对比历史
        if (totalRevenue > 0 && revenueNodes.length >= 2) {
          const prev = Number(revenueNodes[revenueNodes.length - 2]?.props.amount || 0);
          const growth = prev > 0 ? (totalRevenue - prev) / prev : 0;
          if (growth <= t.revenue_growth.critical) {
            findings.push({ id: 'rev_growth_critical', severity: 'critical', title: '收入增长停滞', description: `收入增长率${(growth*100).toFixed(1)}%，低于critical阈值。`, evidence: [`当期: ${totalRevenue}`, `上期: ${prev}`], suggestion: '审查市场策略，寻找新增长点。', detectedAt: new Date().toISOString() });
          } else if (growth <= t.revenue_growth.warning) {
            findings.push({ id: 'rev_growth_warning', severity: 'warning', title: '收入增长放缓', description: `收入增长率${(growth*100).toFixed(1)}%，低于warning阈值。`, detectedAt: new Date().toISOString() });
          }
        }
      }
      if (findings.length) log.info({ teamId, count: findings.length }, '收入健康检查完成');
    } catch (err: any) { log.warn({ err, teamId }, '收入健康检查失败'); }
    return findings;
  },
};
