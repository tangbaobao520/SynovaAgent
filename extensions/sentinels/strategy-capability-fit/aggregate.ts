import type { SentinelFinding } from '../../../src/sentinel/types';
import { computeStrategyCapabilityFit } from './computes/compute-strategy-capability-fit';
import { createLogger } from '../../../src/logger';

const log = createLogger('sentinel/strategy-capability-fit');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

/** S1: 战略-能力一致性。读取 Goal + Capability 节点评估匹配度。 */
export const strategyCapabilityFitSentinel = {
  async check(store: GraphStoreReader, teamId: string): Promise<SentinelFinding[]> {
    const now = new Date();
    const checkedAt = now.toISOString();

    try {
      const goalNodes = store.queryNodes('Goal', { teamId });
      const capNodes = store.queryNodes('Capability', { teamId });

      const goals = goalNodes.map(n => ({
        name: (n.props.name as string) || n.id,
        goalType: n.props.goalType as string | undefined,
      }));

      const capabilities = capNodes.map(n => ({
        name: (n.props.name as string) || n.id,
        category: n.props.category as string | undefined,
        level: n.props.level !== undefined ? Number(n.props.level) : undefined,
      }));

      const result = computeStrategyCapabilityFit(goals, capabilities);
      log.debug({ score: result.score, gaps: result.alignmentGaps.length }, '战略-能力一致性计算完成');

      if (result.degraded) {
        return [{ id: `s1-nodata-${now.getTime()}`, severity: 'info', title: '战略与能力数据不足', description: '缺少 Goal 或 Capability 节点，无法评估一致性。', evidence: [], suggestion: '上传战略目标与核心能力数据。', detectedAt: checkedAt }];
      }

      const scorePct = (result.score * 100).toFixed(0);
      const findings: SentinelFinding[] = [];

      if (result.score < 0.3) {
        findings.push({
          id: `s1-crit-${now.getTime()}`, severity: 'critical',
          title: `战略-能力一致性低 (${scorePct}%)`,
          description: `战略目标与现有能力存在显著差距。`,
          evidence: [
            `一致性评分: ${scorePct}%`,
            `战略/创新目标: ${result.strategicGoals}`,
            `核心能力数: ${result.coreCapabilities}`,
            ...result.alignmentGaps,
          ],
          suggestion: '审视战略目标与核心能力是否匹配，补齐关键能力短板。',
          detectedAt: checkedAt,
        });
      } else if (result.score < 0.6) {
        findings.push({
          id: `s1-warn-${now.getTime()}`, severity: 'warning',
          title: `战略-能力一致性偏低 (${scorePct}%)`,
          description: '部分战略目标缺乏对应能力支撑。',
          evidence: [`一致性评分: ${scorePct}%`, ...result.alignmentGaps],
          suggestion: '评估能力建设优先级，确保战略目标有对应的能力支撑。',
          detectedAt: checkedAt,
        });
      }

      if (result.alignmentGaps.length > 0 && result.score >= 0.6) {
        findings.push({
          id: `s1-info-${now.getTime()}`, severity: 'info',
          title: `战略-能力一致性: ${scorePct}%，存在可改善项`,
          description: result.alignmentGaps.join('; '),
          evidence: result.alignmentGaps,
          suggestion: '定期审视战略目标与能力的匹配度。',
          detectedAt: checkedAt,
        });
      }

      return findings;
    } catch (err: unknown) {
      log.error({ err }, '[strategy-capability-fit] check 失败');
      return [{
        id: `s1-error-${now.getTime()}`, severity: 'warning',
        title: '战略-能力一致性检测异常',
        description: `${(err as Error)?.message || String(err)}`,
        evidence: [], suggestion: '检查 SOG 图数据源。', detectedAt: checkedAt,
      }];
    }
  },
};
