/**
 * customer-demand-shift/aggregate.ts — E4 客户需求迁移哨兵
 *
 * 综合 computeCustomerConcentration + computeCustomerChurnRisk 结果，
 * 比较 manifest.json 阈值，输出 SentinelFinding[]。
 */
import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeCustomerConcentration } from './computes/customer-concentration';
import { computeCustomerChurnRisk } from './computes/customer-churn-risk';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/customer-demand');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const customerDemandShiftSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date();
    const checkedAt = now.toISOString();
    const findings: SentinelFinding[] = [];

    try {
      if (traversal) { const r = traversal.traverse([teamId], ['DEPLOYS']); if (!r.nodes[0]) return []; }
      // 1. 读取 CLIENT 节点
      const clientNodes = store.queryNodes('CLIENT', { teamId });
      const clients = clientNodes.map(n => ({
        name: (n.props.name as string) || n.id,
        revenue: Number(n.props.revenue) || 0,
        status: (n.props.status as string) || 'active',
        churn: n.props.churn === true || n.props.status === 'churned',
        nps: n.props.nps !== undefined ? Number(n.props.nps) : undefined,
      }));

      log.debug({ totalClients: clients.length }, '客户需求迁移计算');

      if (clients.length === 0) {
        return [];
      }

      // 2. 客户集中度
      const concentration = computeCustomerConcentration(clients);
      if (!concentration.degraded) {
        const topPct = (concentration.topCustomerShare * 100).toFixed(0);
        if (concentration.topCustomerShare > 0.4) {
          findings.push({
            id: `e4-concent-crit-${now.getTime()}`, severity: 'critical',
            title: `客户集中度过高: ${concentration.topCustomerName} (${topPct}%)`,
            description: `最大客户占比超过 40%。单一客户流失将严重影响营收。`,
            evidence: [`最大客户: ${concentration.topCustomerName}`, `占比: ${topPct}%`],
            suggestion: '拓展新客户，降低对最大客户的依赖。',
            detectedAt: checkedAt,
          });
        } else if (concentration.topCustomerShare > 0.3) {
          findings.push({
            id: `e4-concent-warn-${now.getTime()}`, severity: 'warning',
            title: `客户集中度偏高 (${topPct}%)`,
            description: `${concentration.topCustomerName} 占比 > 30%。`,
            evidence: [`占比: ${topPct}%`, `活跃客户: ${concentration.activeClientCount}`],
            suggestion: '观察集中度趋势，必要时拓展新客户。',
            detectedAt: checkedAt,
          });
        }
      }

      // 3. 客户流失风险
      const churn = computeCustomerChurnRisk(clients);
      if (!churn.degraded) {
        const chPct = (churn.churnRate * 100).toFixed(0);
        const rChPct = (churn.revenueChurnRate * 100).toFixed(0);

        if (churn.churnRate > 0.2 || churn.revenueChurnRate > 0.2) {
          findings.push({
            id: `e4-churn-crit-${now.getTime()}`, severity: 'critical',
            title: `客户流失率过高 (数量${chPct}% / 营收${rChPct}%)`,
            description: `${clients.length} 个客户中流失率超过 20%。`,
            evidence: [`流失率: ${chPct}%`, `营收流失率: ${rChPct}%`],
            suggestion: '排查流失客户共性，建立客户成功团队。',
            detectedAt: checkedAt,
          });
        } else if (churn.churnRate > 0.1) {
          findings.push({
            id: `e4-churn-warn-${now.getTime()}`, severity: 'warning',
            title: `客户流失趋势 (${chPct}%)`,
            description: `流失率超过 10% 警戒线。`,
            evidence: [`流失率: ${chPct}%`],
            suggestion: '启动客户挽回计划。',
            detectedAt: checkedAt,
          });
        }

        if (churn.highValueAtRisk.length > 0) {
          findings.push({
            id: `e4-atrisk-${now.getTime()}`, severity: 'warning',
            title: `高价值客户满意度低: ${churn.highValueAtRisk.join(', ')}`,
            description: `${churn.highValueAtRisk.length} 个高价值客户 NPS < 30。`,
            evidence: churn.highValueAtRisk.map(n => `${n}: 高价值低 NPS`),
            suggestion: '优先联系这些客户，了解不满原因。',
            detectedAt: checkedAt,
          });
        }
      }

      if (findings.length === 0 && clients.length > 0) {
        findings.push({
          id: `e4-healthy-${now.getTime()}`, severity: 'info',
          title: '客户需求稳定',
          description: `${clients.length} 个活跃客户，无异常流失或集中风险。`,
          evidence: [`活跃客户: ${clients.length}`],
          suggestion: '维持客户成功投入。',
          detectedAt: checkedAt,
        });
      }

      return findings;
    } catch (err: unknown) {
      log.error({ err }, '[customer-demand-shift] check 失败');
      return [{
        id: `e4-error-${now.getTime()}`, severity: 'warning',
        title: '客户需求迁移检测异常',
        description: `检测出错: ${(err as Error)?.message || String(err)}`,
        evidence: [],
        suggestion: '检查 SOG 图数据源。',
        detectedAt: checkedAt,
      }];
    }
  },
};
