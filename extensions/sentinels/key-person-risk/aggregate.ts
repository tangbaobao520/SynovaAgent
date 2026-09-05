/**
 * key-person-risk/aggregate.ts — 关键人风险哨兵聚合
 *
 * 包装 src/l3/key-person-risk.ts 的 checkKeyPersonRisk 到哨兵接口。
 * D577: DECISION_CONCENTRATES 判定源 = loader 注入 thresholds（manifest 基线 + memStore 覆写，第 4 参）；
 * 未注入（直调/单测）fallback 内置默认 DEFAULT_THRESHOLDS（与改造前硬编码现值一致，蓝绿基准）。
 */
import { checkKeyPersonRisk } from '../../../src/l3/key-person-risk';
import type { SentinelFinding, SentinelThresholdPair } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/key-person-risk');

/** 内置默认阈值 = 改造前硬编码现值（D577 蓝绿基准：注入与默认行为完全一致） */
const DEFAULT_THRESHOLDS = {
  decision_concentration: { warning: 0.6, critical: 0.8 },
} as const;

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const keyPersonRiskSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal,
    thresholds?: Record<string, SentinelThresholdPair>): Promise<SentinelFinding[]> {
    // D577: 阈值消费契约 — 注入优先；参数在但缺 key → log.warn（真配置缺口）；未注入 → log.debug（直调/单测）
    const th = (key: keyof typeof DEFAULT_THRESHOLDS): SentinelThresholdPair => {
      const injected = thresholds?.[key];
      if (injected) return injected;
      if (thresholds) log.warn({ sentinel: 'key-person-risk', key }, 'thresholds 注入缺 key — fallback 内置默认（manifest 配置缺口）');
      else log.debug({ sentinel: 'key-person-risk', key }, 'thresholds 未注入（直调/单测）— fallback 内置默认');
      return DEFAULT_THRESHOLDS[key];
    };
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
              if (ci > th('decision_concentration').critical) {
                findings.push({
                  id: `kpr-dc-crit-${Date.now()}`,
                  severity: 'critical' as const,
                  title: '决策高度集中',
                  description: `决策集中度 ${(ci * 100).toFixed(0)}% > 80%，关键人依赖风险加重。`,
                  evidence: [`concentration_index: ${ci}`, `reversal_cost: ${edge.props.reversal_cost || 'N/A'}`],
                  suggestion: '分散决策权，建立接班人机制，降低单点故障风险。',
                  detectedAt: new Date().toISOString(),
                });
              } else if (ci > th('decision_concentration').warning) {
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
