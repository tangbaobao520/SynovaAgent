/** revenue-health aggregate — 收入健康哨兵。综合N个指标→1条Finding。V4.4.2 */
import type { GraphStoreReader, SentinelManifest } from '../../../src/sentinel/sentinel-loader';
import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { createLogger } from '@synova/logger';
import { computeRevenueGrowth } from './computes/compute-revenue-growth';

const log = createLogger('sentinel/revenue-health');

export const revenueHealthSentinel = {
  manifest: null as SentinelManifest | null,
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const findings: SentinelFinding[] = [];
    let revenueNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let clientNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let usedTraversal = false;
    let totalRevenue = 0;

    try {
      // 图遍历或旧路径获取节点
      try {
        if (traversal) {
          const finR = traversal.traverse([teamId], ['FUNDS', 'OPERATIONAL_EXECUTION']);
          const clientR = traversal.traverse([teamId], ['DEPLOYS']);
          if (finR.nodes[0] || clientR.nodes[0]) {
            revenueNodes = finR.nodes.filter(n => n.props.financialType === 'revenue' || n.props.total_revenue);
            clientNodes = clientR.nodes.filter(n => n.type === 'CLIENT');
            usedTraversal = true;
          }
        }
      } catch (err: unknown) { log.warn({ err, teamId }, '图遍历失败 — 降级到旧路径'); }

      if (!usedTraversal) {
        const nodes = store.queryNodes('Financial', { teamId });
        revenueNodes = nodes.filter(n => n.props.financialType === 'revenue');
        clientNodes = store.queryNodes('Client', { teamId });
      }

      if (!revenueNodes[0]) { log.info({ teamId }, '无收入数据'); return []; }

      totalRevenue = revenueNodes.reduce((s, n) => s + (Number(n.props.amount) || Number(n.props.total_revenue) || 0), 0);
      const clientCount = clientNodes.length;
      const cr5 = clientCount > 0 ? Math.min(1, clientCount / 5) : 0;

      // 收入增长率 — 通过 compute 函数
      const growthResult = await computeRevenueGrowth(store, { teamId, traversal });

      if (this.manifest) {
        const t = this.manifest.thresholds;
        // 客户集中度
        if (cr5 >= t.customer_concentration.critical) {
          findings.push({ id: 'rev_conc_critical', severity: 'critical', title: '客户集中度过高', description: `CR5估算${(cr5 * 100).toFixed(0)}%，超出critical阈值。`, evidence: [`客户数: ${clientCount}`, `收入来源: ${revenueNodes.length}`], suggestion: '拓展客户基础，降低单客户依赖。', detectedAt: new Date().toISOString() });
        } else if (cr5 >= t.customer_concentration.warning) {
          findings.push({ id: 'rev_conc_warning', severity: 'warning', title: '客户集中度偏高', description: `CR5估算${(cr5 * 100).toFixed(0)}%，超出warning阈值。`, detectedAt: new Date().toISOString() });
        }
        // 收入增长率
        if (!growthResult.degraded && growthResult.value <= t.revenue_growth.critical) {
          findings.push({ id: 'rev_growth_critical', severity: 'critical', title: '收入增长停滞', description: `收入增长率${(growthResult.value * 100).toFixed(1)}%，低于critical阈值。`, evidence: [`当期: ${growthResult.totalRevenue}`, `上期: ${growthResult.previousRevenue}`], suggestion: '审查市场策略，寻找新增长点。', detectedAt: new Date().toISOString() });
        } else if (!growthResult.degraded && growthResult.value <= t.revenue_growth.warning) {
          findings.push({ id: 'rev_growth_warning', severity: 'warning', title: '收入增长放缓', description: `收入增长率${(growthResult.value * 100).toFixed(1)}%，低于warning阈值。`, detectedAt: new Date().toISOString() });
        }
      }
      if (findings.length) log.info({ teamId, count: findings.length }, '收入健康检查完成');
    } catch (err: any) { log.warn({ err, teamId }, '收入健康检查失败'); }
    return findings;
  },
};
