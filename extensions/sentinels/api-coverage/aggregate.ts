/**
 * api-coverage/aggregate.ts — T2 API可达性与协议覆盖哨兵
 *
 * 综合 computeApiAvailability + computeProtocolCoverage 结果，
 * 比较 manifest.json 阈值，输出 SentinelFinding[]。
 */
import type { SentinelFinding } from '../../../src/sentinel/types';
import { computeApiAvailability } from './computes/api-availability';
import { computeProtocolCoverage } from './computes/protocol-coverage';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/api-coverage');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const apiCoverageSentinel = {
  async check(store: GraphStoreReader, teamId: string): Promise<SentinelFinding[]> {
    const now = new Date();
    const checkedAt = now.toISOString();
    const findings: SentinelFinding[] = [];

    try {
      // 1. 从本体层读取 TOOL 节点
      const toolNodes = store.queryNodes('TOOL', { teamId });
      const tools = toolNodes.map(n => ({
        id: n.id,
        name: (n.props.name as string) || n.id,
        url: (n.props.url || n.props.endpoint) as string | undefined,
        protocol: n.props.protocol as string | undefined,
      }));

      // 2. 计算 API 可达率
      const apiResult = await computeApiAvailability(
        tools.filter(t => t.url).map(t => ({ id: t.id, name: t.name, url: t.url }))
      );
      log.debug({ rate: apiResult.rate, total: apiResult.totalTools }, 'API 可达率计算完成');

      if (!apiResult.degraded && apiResult.totalTools > 0) {
        const apPct = (apiResult.rate * 100).toFixed(0);
        if (apiResult.rate < 0.6) {
          findings.push({
            id: `t2-api-crit-${now.getTime()}`, severity: 'critical',
            title: `API 可达率过低 (${apPct}%)`,
            description: `${apiResult.totalTools} 个系统中仅 ${apiResult.reachableNames.length} 个可达。`,
            evidence: [`可达率: ${apPct}%`, `不可达: ${apiResult.unreachableDetails.join('; ')}`],
            suggestion: '检查网络策略和服务状态，确保 Agent 可调用企业系统。',
            detectedAt: checkedAt,
          });
        } else if (apiResult.rate < 0.8) {
          findings.push({
            id: `t2-api-warn-${now.getTime()}`, severity: 'warning',
            title: `API 可达率偏低 (${apPct}%)`,
            description: `${apiResult.unreachableDetails.length}/${apiResult.totalTools} 个系统不可达。`,
            evidence: [`可达率: ${apPct}%`, `不可达: ${apiResult.unreachableDetails.join('; ')}`],
            suggestion: '排查不可达系统，检查认证和网络配置。',
            detectedAt: checkedAt,
          });
        }
      }

      // 3. 计算协议覆盖率
      const protoResult = computeProtocolCoverage(tools);
      log.debug({ coverage: protoResult.coverage, total: protoResult.totalTools }, '协议覆盖率计算完成');

      if (!protoResult.degraded && protoResult.totalTools > 0) {
        const pcPct = (protoResult.coverage * 100).toFixed(0);
        if (protoResult.coverage < 0.3) {
          findings.push({
            id: `t2-proto-crit-${now.getTime()}`, severity: 'critical',
            title: `协议覆盖率过低 (${pcPct}%)`,
            description: `${protoResult.totalTools} 个工具中仅覆盖 ${protoResult.coveredProtocols.length}/6 种标准协议。`,
            evidence: [`覆盖率: ${pcPct}%`, `未覆盖: ${protoResult.uncoveredProtocols.join(', ')}`],
            suggestion: '将高频工具接入 MCP 标准协议，降低 Agent 集成成本。',
            detectedAt: checkedAt,
          });
        } else if (protoResult.coverage < 0.6) {
          findings.push({
            id: `t2-proto-warn-${now.getTime()}`, severity: 'warning',
            title: `协议覆盖率不足 (${pcPct}%)`,
            description: `还有 ${protoResult.uncoveredProtocols.length}/6 种标准协议未覆盖。`,
            evidence: [`覆盖率: ${pcPct}%`, `未覆盖: ${protoResult.uncoveredProtocols.join(', ')}`],
            suggestion: '扩展工具协议支持，优先 MCP 和 REST。',
            detectedAt: checkedAt,
          });
        }
      }

      return findings;
    } catch (err: unknown) {
      log.error({ err }, '[api-coverage] check 失败');
      // 铁律24: catch 必须有 log + degraded
      return [{
        id: `t2-error-${now.getTime()}`, severity: 'warning',
        title: 'API 覆盖检测异常',
        description: `检测过程出错: ${(err as Error)?.message || String(err)}`,
        evidence: [],
        suggestion: '检查 SOG 图数据源是否可用。',
        detectedAt: checkedAt,
      }];
    }
  },
};
