/**
 * data-health/aggregate.ts — T3 数据健康度哨兵
 *
 * 综合 computeDataReadiness + computeDataSiloScore 结果，
 * 比较 manifest.json 阈值，输出 SentinelFinding[]。
 */
import type { SentinelFinding } from '../../../src/sentinel/types';
import { computeDataReadiness } from './computes/data-readiness-score';
import { computeDataSiloScore } from './computes/data-silo-score';
import type { DataFlowEdge } from './computes/data-silo-score';
import { createLogger } from '../../../src/logger';

const log = createLogger('sentinel/data-health');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const dataHealthSentinel = {
  async check(store: GraphStoreReader, teamId: string): Promise<SentinelFinding[]> {
    const now = new Date();
    const checkedAt = now.toISOString();
    const findings: SentinelFinding[] = [];

    try {
      // 1. 读取所有节点（数据就绪度）
      const allNodes = store.queryNodes('ALL', { teamId });
      const readiness = computeDataReadiness(allNodes);
      log.debug({ readiness: readiness.readiness, total: readiness.totalNodes }, '数据就绪度计算完成');

      if (!readiness.degraded && readiness.totalNodes > 0) {
        const rdPct = (readiness.readiness * 100).toFixed(0);
        if (readiness.readiness < 0.3) {
          findings.push({
            id: `t3-readiness-crit-${now.getTime()}`, severity: 'critical',
            title: `数据就绪度过低 (${rdPct}%)`,
            description: `${readiness.totalNodes} 个节点中 ${(readiness.missingFieldRate * 100).toFixed(0)}% 仅含基础字段。`,
            evidence: [`就绪度: ${rdPct}%`, `缺失字段率: ${(readiness.missingFieldRate * 100).toFixed(0)}%`],
            suggestion: '上传更丰富的企业文档（组织结构图、财务表、客户清单）。',
            detectedAt: checkedAt,
          });
        } else if (readiness.readiness < 0.6) {
          findings.push({
            id: `t3-readiness-warn-${now.getTime()}`, severity: 'warning',
            title: `数据就绪度偏低 (${rdPct}%)`,
            description: `结构化数据占比 ${(readiness.structuredRate * 100).toFixed(0)}%。`,
            evidence: [`就绪度: ${rdPct}%`, `结构化率: ${(readiness.structuredRate * 100).toFixed(0)}%`],
            suggestion: '按维度上传结构化文档。',
            detectedAt: checkedAt,
          });
        }
        if (readiness.piiHitCount > 0) {
          findings.push({
            id: `t3-pii-${now.getTime()}`, severity: 'warning',
            title: `检测到 ${readiness.piiHitCount} 个节点含潜在 PII`,
            description: '个人身份信息(手机/身份证/薪资)混入本体层，存在隐私合规风险。',
            evidence: [`PII 命中: ${readiness.piiHitCount}/${readiness.totalNodes}`],
            suggestion: '运行 PIIScrubber 清理敏感字段。',
            detectedAt: checkedAt,
          });
        }
      }

      // 2. 读取系统节点和数据流边（数据孤岛）
      const toolNodes = store.queryNodes('TOOL', { teamId });
      const appNodes = store.queryNodes('APP', { teamId });
      const sysNodes = store.queryNodes('SYSTEM', { teamId });
      const allSystems = [...toolNodes, ...appNodes, ...sysNodes].map(n => ({
        id: n.id,
        name: (n.props.name as string) || n.id,
      }));

      // 从 edges 获取数据流（需要从 store 读取 — 此处简化处理）
      const edges: DataFlowEdge[] = [];
      // 系统间数据流：期望 graph store 有 DATA_FLOW / INTEGRATES 边
      // 当前 GraphStoreReader 接口不支持 queryEdges，留空不阻断
      log.debug({ totalSystems: allSystems.length }, '数据孤岛计算完成');

      const siloResult = computeDataSiloScore(allSystems, edges);
      if (!siloResult.degraded && siloResult.totalSystems >= 2) {
        const srPct = (siloResult.siloRate * 100).toFixed(0);
        if (siloResult.siloRate > 0.5) {
          findings.push({
            id: `t3-silo-crit-${now.getTime()}`, severity: 'critical',
            title: `数据孤岛严重 (${srPct}% 系统孤立)`,
            description: `${siloResult.siloCount}/${siloResult.totalSystems} 个系统无数据流通。`,
            evidence: [`孤岛率: ${srPct}%`, `连接密度: ${(siloResult.connectivityDensity * 100).toFixed(1)}%`],
            suggestion: '优先打通核心业务系统之间的数据流。',
            detectedAt: checkedAt,
          });
        } else if (siloResult.siloRate > 0.3) {
          findings.push({
            id: `t3-silo-warn-${now.getTime()}`, severity: 'warning',
            title: `数据孤岛率偏高 (${srPct}%)`,
            description: `${siloResult.siloCount} 个系统处于孤立状态。`,
            evidence: [`孤岛率: ${srPct}%`, `连接密度: ${(siloResult.connectivityDensity * 100).toFixed(1)}%`],
            suggestion: '评估这些系统是否需要对接。',
            detectedAt: checkedAt,
          });
        }
      }

      return findings;
    } catch (err: unknown) {
      log.error({ err }, '[data-health] check 失败');
      return [{
        id: `t3-error-${now.getTime()}`, severity: 'warning',
        title: '数据健康度检测异常',
        description: `检测过程出错: ${(err as Error)?.message || String(err)}`,
        evidence: [],
        suggestion: '检查 SOG 图数据源是否可用。',
        detectedAt: checkedAt,
      }];
    }
  },
};
