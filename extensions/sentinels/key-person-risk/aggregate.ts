/**
 * key-person-risk/aggregate.ts — 关键人风险哨兵聚合
 *
 * 包装 src/l3/key-person-risk.ts 的 checkKeyPersonRisk 到哨兵接口。
 */
import { checkKeyPersonRisk } from '../../../src/l3/key-person-risk';
import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/key-person-risk');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const keyPersonRiskSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    try {
      const result = checkKeyPersonRisk(store, teamId);
      const findings = [...result.findings];
      // T7b: DECISION_CONCENTRATES — 决策集中度检查
      if (traversal) {
        try {
          const dcResult = traversal.traverse([teamId], ['DECISION_CONCENTRATES']);
          if (dcResult.edges.length > 0) {
            for (const edge of dcResult.edges) {
              const ci = Number(edge.props.concentration_index) || 0;
              if (ci > 0.8) {
                findings.push({
                  id: `kpr-dc-crit-${Date.now()}`,
                  severity: 'critical' as const,
                  title: '决策高度集中',
                  description: `决策集中度 ${(ci * 100).toFixed(0)}% > 80%，关键人依赖风险加重。`,
                  evidence: [`concentration_index: ${ci}`, `reversal_cost: ${edge.props.reversal_cost || 'N/A'}`],
                  suggestion: '分散决策权，建立接班人机制，降低单点故障风险。',
                  detectedAt: new Date().toISOString(),
                });
              } else if (ci > 0.6) {
                findings.push({
                  id: `kpr-dc-warn-${Date.now()}`,
                  severity: 'warning' as const,
                  title: '决策偏集中',
                  description: `决策集中度 ${(ci * 100).toFixed(0)}% > 60%，建议关注关键人依赖。`,
                  detectedAt: new Date().toISOString(),
                });
              }
            }
          }
        } catch (err: unknown) {
          log.warn({ err, teamId }, 'DECISION_CONCENTRATES遍历失败');
        }
      }
      return findings;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ err, teamId }, '[key-person-risk] aggregate check失败');
      return [{
        id: `kpr-error-${Date.now()}`,
        severity: 'warning' as const,
        title: '关键人风险检测异常',
        description: msg,
        evidence: [],
        suggestion: '检查Person节点数据源。',
        detectedAt: new Date().toISOString(),
      }];
    }
  },
};
