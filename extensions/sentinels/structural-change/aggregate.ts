/**
 * structural-change/aggregate.ts — E6 底层结构变化哨兵
 */
import type { SentinelFinding } from '../../../src/sentinel/types';
import { computeStructuralChangeSignal } from './computes/structural-change-signal';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/structural-change');

interface GraphStoreReader { queryNodes(type: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown>; }>; }

export const structuralChangeSentinel = {
  async check(store: GraphStoreReader, teamId: string): Promise<SentinelFinding[]> {
    const now = new Date(); const checkedAt = now.toISOString();
    try {
      const eventNodes = store.queryNodes('Event', { teamId });
      const complianceNodes = store.queryNodes('Compliance', { teamId });
      const events = [...eventNodes, ...complianceNodes].map(n => ({ eventType: n.props.eventType as string, description: JSON.stringify(n.props) }));
      const result = computeStructuralChangeSignal(events);
      log.debug({ score: result.score }, '结构变化检测完成');

      if (result.score > 0.7) {
        return [{ id: `e6-structural-${now.getTime()}`, severity: 'critical', title: `底层结构变化信号强烈 (${(result.score * 100).toFixed(0)}%)`, description: '技术-经济范式可能正在转移。', evidence: result.signals, suggestion: '评估底层变化对企业战略的根本性影响。', detectedAt: checkedAt }];
      } else if (result.score > 0.5) {
        return [{ id: `e6-structural-warn-${now.getTime()}`, severity: 'warning', title: `底层结构变化信号 (${(result.score * 100).toFixed(0)}%)`, description: '检测到结构性变化信号。', evidence: result.signals, suggestion: '密切监视变化趋势。', detectedAt: checkedAt }];
      }
      return [];
    } catch (err: unknown) {
      log.error({ err }, '[structural-change] check 失败');
      return [{ id: `e6-error-${now.getTime()}`, severity: 'warning', title: '结构变化检测异常', description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt }];
    }
  },
};
