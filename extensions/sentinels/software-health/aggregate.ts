/**
 * software-health/aggregate.ts — T1 软件资产健康度哨兵
 *
 * 综合 computeSaasUsageScore + computeShadowItScore 结果，
 * 比较 manifest.json 阈值，输出 SentinelFinding[]。
 */
import type { SentinelFinding } from '../../../src/sentinel/types';
import { computeSaasUsageScore } from './computes/saas-usage-score';
import { computeShadowItScore } from './computes/shadow-it-score';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/software-health');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const softwareHealthSentinel = {
  async check(store: GraphStoreReader, teamId: string): Promise<SentinelFinding[]> {
    const now = new Date();
    const checkedAt = now.toISOString();
    const findings: SentinelFinding[] = [];

    try {
      // 1. 读取 TOOL/APP/SOFTWARE 节点
      const toolNodes = store.queryNodes('TOOL', { teamId });
      const appNodes = store.queryNodes('APP', { teamId });
      const swNodes = store.queryNodes('SOFTWARE', { teamId });
      const allTools = [...toolNodes, ...appNodes, ...swNodes].map(n => ({
        id: n.id,
        name: (n.props.name as string) || n.id,
        status: (n.props.status || n.props.usageStatus || 'unknown') as string,
        category: (n.props.category && n.props.category !== '' ? String(n.props.category) : 'cat_unknown') as string,
      }));

      // 2. SaaS 利用率
      const usage = computeSaasUsageScore(
        allTools.map(t => ({ id: t.id, name: t.name, status: t.status, category: t.category }))
      );
      log.debug({ usageRate: usage.usageRate, total: usage.totalTools }, 'SaaS 利用率计算完成');

      if (!usage.degraded && usage.totalTools > 0) {
        const usPct = (usage.usageRate * 100).toFixed(0);
        if (usage.usageRate < 0.2) {
          findings.push({
            id: `t1-usage-crit-${now.getTime()}`, severity: 'critical',
            title: `SaaS 利用率极低 (${usPct}%)`,
            description: `${usage.totalTools} 个工具中仅 ${usage.activeCount} 个在用。`,
            evidence: [`利用率: ${usPct}%`, `闲置: ${usage.idleCount}`],
            suggestion: '审查闲置工具: 是否仍付费？功能是否被其他工具覆盖？',
            detectedAt: checkedAt,
          });
        } else if (usage.usageRate < 0.4) {
          findings.push({
            id: `t1-usage-warn-${now.getTime()}`, severity: 'warning',
            title: `SaaS 利用率偏低 (${usPct}%)`,
            description: `${usage.idleCount}/${usage.totalTools} 个工具闲置或状态未知。`,
            evidence: [`利用率: ${usPct}%`, `闲置: ${usage.idleCount}`],
            suggestion: '确认闲置工具是否仍需付费。',
            detectedAt: checkedAt,
          });
        }

        for (const oc of usage.overlappingCategories) {
          findings.push({
            id: `t1-overlap-${oc.category}-${now.getTime()}`, severity: 'warning',
            title: `${oc.category} 类别 ${oc.toolCount} 个工具可能重叠`,
            description: `同类工具: ${oc.toolNames.join(', ')}。`,
            evidence: [`类别: ${oc.category}`, `工具数: ${oc.toolCount}`],
            suggestion: `审查 ${oc.category} 工具: 是否可以合并到 1-2 个？`,
            detectedAt: checkedAt,
          });
        }
      }

      // 3. 影子 IT
      const shadowInput = allTools.map(t => ({
        id: t.id,
        name: t.name,
        authorized: (t.status === 'active' || t.status === 'in_use'),
        category: t.category,
      }));
      const shadow = computeShadowItScore(shadowInput);
      log.debug({ unauthorizedRate: shadow.unauthorizedRate }, '影子 IT 计算完成');

      if (!shadow.degraded && shadow.totalTools > 0) {
        const siPct = (shadow.unauthorizedRate * 100).toFixed(0);
        if (shadow.unauthorizedRate > 0.5) {
          findings.push({
            id: `t1-shadow-crit-${now.getTime()}`, severity: 'critical',
            title: `影子 IT 风险高 (${siPct}% 未授权)`,
            description: `${shadow.unauthorizedCount}/${shadow.totalTools} 个工具无明确授权记录。`,
            evidence: [`未授权率: ${siPct}%`, `高风险: ${shadow.highRiskUnauthorized.join(', ') || '无'}`],
            suggestion: '全面审计软件使用情况，建立软件准入流程。',
            detectedAt: checkedAt,
          });
        } else if (shadow.unauthorizedRate > 0.3) {
          findings.push({
            id: `t1-shadow-warn-${now.getTime()}`, severity: 'warning',
            title: `影子 IT 风险 (${siPct}% 未授权)`,
            description: `${shadow.unauthorizedCount} 个工具有潜在合规风险。`,
            evidence: [`未授权率: ${siPct}%`],
            suggestion: '启动软件审计，确认未授权工具的合规性。',
            detectedAt: checkedAt,
          });
        }
      }

      return findings;
    } catch (err: unknown) {
      log.error({ err }, '[software-health] check 失败');
      return [{
        id: `t1-error-${now.getTime()}`, severity: 'warning',
        title: '软件资产健康度检测异常',
        description: `检测出错: ${(err as Error)?.message || String(err)}`,
        evidence: [],
        suggestion: '检查 SOG 图数据源。',
        detectedAt: checkedAt,
      }];
    }
  },
};
