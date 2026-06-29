import type { SentinelFinding } from '../../../src/sentinel/types';
import { computeAdaptationVelocity } from './computes/compute-adaptation-velocity';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/adaptation-velocity');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const adaptationVelocitySentinel = {
  async check(store: GraphStoreReader, teamId: string): Promise<SentinelFinding[]> {
    const now = new Date();
    const checkedAt = now.toISOString();

    try {
      const eventNodes = store.queryNodes('Event', { teamId });
      const goalNodes = store.queryNodes('Goal', { teamId });

      const events = [
        ...eventNodes.map(n => ({
          eventType: n.props.eventType as string | undefined,
          timestamp: n.props.timestamp as string | undefined,
        })),
        ...goalNodes.map(n => ({
          eventType: 'strategic',
          timestamp: n.props.timestamp as string | undefined,
        })),
      ];

      const result = computeAdaptationVelocity(events);
      log.debug({ score: result.score, adaptations: result.adaptationEvents }, '调适速度计算完成');

      const scorePct = (result.score * 100).toFixed(0);

      if (result.score < 0.3) {
        return [{
          id: `s2-crit-${now.getTime()}`, severity: 'critical',
          title: `战略调适速度慢 (${scorePct}%)`,
          description: `${result.totalEvents} 个事件中仅 ${result.adaptationEvents} 个触发了调适行动。`,
          evidence: [`调适速度: ${scorePct}%`, `适调事件: ${result.adaptationEvents}/${result.totalEvents}`, ...result.signals],
          suggestion: '建立快速响应机制，缩短从发现问题到采取行动的时间。',
          detectedAt: checkedAt,
        }];
      }

      if (result.score < 0.6) {
        return [{
          id: `s2-warn-${now.getTime()}`, severity: 'warning',
          title: `战略调适速度偏低 (${scorePct}%)`,
          description: '组织对变化的响应速度有待提升。',
          evidence: [`调适速度: ${scorePct}%`, ...result.signals],
          suggestion: '简化决策流程，提高执行效率。',
          detectedAt: checkedAt,
        }];
      }

      if (result.signals.length > 0) {
        return [{
          id: `s2-info-${now.getTime()}`, severity: 'info',
          title: `战略调适速度: ${scorePct}%`,
          description: result.signals.join('; '),
          evidence: result.signals,
          suggestion: '持续保持调适能力。',
          detectedAt: checkedAt,
        }];
      }

      return [];
    } catch (err: unknown) {
      log.error({ err }, '[adaptation-velocity] check 失败');
      return [{
        id: `s2-error-${now.getTime()}`, severity: 'warning',
        title: '战略调适速度检测异常',
        description: `${(err as Error)?.message || String(err)}`,
        evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt,
      }];
    }
  },
};
