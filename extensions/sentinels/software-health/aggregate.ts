/**
 * software-health/aggregate.ts — T1 软件资产健康度哨兵
 *
 * 综合 computeSaasUsageScore + computeShadowItScore 结果，
 * 比较 manifest.json 阈值，输出 SentinelFinding[]。
 *
 * V4.4.0: 优先使用图遍历，降级到 queryNodes
 */
import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeSaasUsageScore } from './computes/saas-usage-score';
import { computeShadowItScore } from './computes/shadow-it-score';
import { computeIntegrationHealth } from './computes/integration-health';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/software-health');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const softwareHealthSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date();
    const checkedAt = now.toISOString();
    const findings: SentinelFinding[] = [];
    let allTools: Array<{ id: string; name: string; status: string; category: string; hasUrl: boolean }> = [];
    let hasData = false;

    try {
      // V4.4.0: 优先使用图遍历
      try {
        if (traversal) {
          const result = traversal.traverse([teamId], ['DEPLOYS']);
          if (result.nodes[0]) {
            allTools = result.nodes.filter(n => n.type === 'TOOL').map(n => ({
              id: n.id,
              name: (n.props.name as string) || n.id,
              status: (n.props.status as string) || 'unknown',
              category: (n.props.category && n.props.category !== '' ? String(n.props.category) : 'cat_unknown') as string,
              hasUrl: !!(n.props.url || n.props.api_endpoint),
            }));
            hasData = true;
          }
        }
      } catch (err: unknown) {
        log.warn({ err, teamId }, '图遍历失败 — 降级到旧路径');
      }

      // 降级: queryNodes 旧路径
      if (!hasData) {
        const toolNodes = store.queryNodes('Tool', { teamId });
        // APP/SOFTWARE 统一用 Tool 类型替代
        allTools = toolNodes.map(n => ({
          id: n.id,
          name: (n.props.name as string) || n.id,
          status: (n.props.status || n.props.usageStatus || 'unknown') as string,
          category: (n.props.category && n.props.category !== '' ? String(n.props.category) : 'cat_unknown') as string,
          hasUrl: !!(n.props.url || n.props.endpoint || n.props.apiEndpoint),
        }));
        hasData = allTools.length > 0;
      }

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

      // 4. 集成健康度 (T1c)
      const ihInput = allTools.map(t => ({ id: t.id, hasOutEdge: t.hasUrl }));
      const ih = computeIntegrationHealth(ihInput);
      log.debug({ connectivityRate: ih.connectivityRate }, '集成健康度计算完成');

      if (!ih.degraded && ih.totalSystems > 0) {
        if (ih.signal === 'critical') {
          findings.push({
            id: `t1-ih-crit-${now.getTime()}`, severity: 'critical',
            title: `数据孤岛严重 — ${(ih.connectivityRate * 100).toFixed(0)}% 系统已连通`,
            description: `${ih.totalSystems} 个系统中仅 ${ih.connectedSystems} 个有 API 连接。`,
            evidence: [`连通率: ${(ih.connectivityRate * 100).toFixed(0)}%`, `孤立系统: ${ih.isolatedSystems.slice(0, 5).join(', ')}`],
            suggestion: '推进系统间 API 集成，消除数据孤岛。',
            detectedAt: checkedAt,
          });
        } else if (ih.signal === 'warning') {
          findings.push({
            id: `t1-ih-warn-${now.getTime()}`, severity: 'warning',
            title: `系统连通率偏低 (${(ih.connectivityRate * 100).toFixed(0)}%)`,
            description: `${ih.totalSystems} 个系统中 ${ih.isolatedSystems.length} 个可能处于孤立状态。`,
            evidence: [`连通率: ${(ih.connectivityRate * 100).toFixed(0)}%`],
            suggestion: '评估孤立系统的数据交换需求，优先集成高价值系统。',
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
