/**
 * market-lifecycle/aggregate.ts — E1 市场天花板与生命周期哨兵
 */
import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeLifecycleStage } from './computes/lifecycle-stage';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/market-lifecycle');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const marketLifecycleSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date();
    const checkedAt = now.toISOString();
    const findings: SentinelFinding[] = [];
    let marketNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let finNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let usedTraversal = false;

    try {
      try { if (traversal) { const r = traversal.traverse([teamId], ['PRODUCES', 'INFORMS']); if (r.nodes[0]) { marketNodes = r.nodes.filter(n => n.type === 'MARKET_OUTCOME'); finNodes = r.nodes; usedTraversal = true; } } } catch (err: unknown) { log.warn({ err, teamId }, '图遍历失败 — 降级到旧路径'); }
      if (!usedTraversal) { marketNodes = store.queryNodes('Market', { teamId }); finNodes = store.queryNodes('FINANCIAL', { teamId }); }

      if (marketNodes.length === 0 || finNodes.length === 0) {
        return [{
          id: `e1-nodata-${now.getTime()}`, severity: 'info',
          title: '市场数据不足',
          description: '缺少 Market 或 FINANCIAL 节点，无法判定生命周期。',
          evidence: [`Market节点: ${marketNodes.length}`, `FINANCIAL节点: ${finNodes.length}`],
          suggestion: '上传行业数据或财务数据。',
          detectedAt: checkedAt,
        }];
      }

      const revenues = finNodes.map(n => Number(n.props.revenue) || Number(n.props.amount) || 0).filter(r => r > 0);
      const currentRevenue = revenues.reduce((a, b) => a + b, 0);
      const previousRevenue = currentRevenue * 0.85; // 简化: 假设上年为当前85%

      const result = computeLifecycleStage({
        currentRevenue,
        previousRevenue,
        competitorEntries: 1,
        competitorExits: 0,
        totalCompetitors: marketNodes.length,
      });

      log.debug({ stage: result.stage, growth: result.industryGrowthRate }, '生命周期判定完成');

      const grPct = (result.industryGrowthRate * 100).toFixed(1);

      let severity: 'critical' | 'warning' | 'info' = 'info';
      if (result.stage === 'decline') severity = 'critical';
      else if (result.stage === 'shakeout') severity = 'warning';
      else if (result.stage === 'maturity' && result.industryGrowthRate < 0.02) severity = 'warning';

      const stageLabels: Record<string, string> = {
        introduction: '导入期',
        growth: '成长期',
        shakeout: '洗牌期',
        maturity: '成熟期',
        decline: '衰退期',
      };

      findings.push({
        id: `e1-stage-${now.getTime()}`, severity,
        title: `产业处于${stageLabels[result.stage]}（增长率 ${grPct}%）`,
        description: `基于Klepper规则判定: 增长率${grPct}%，竞争者${result.competitorCount}个。`,
        evidence: [
          `阶段: ${result.stage}`,
          `增长率: ${grPct}%`,
          `竞争者: ${result.competitorCount}`,
          `置信度: ${(result.confidence * 100).toFixed(0)}%`,
          ...result.warnings,
        ],
        suggestion: result.stage === 'decline' ? '行业萎缩中，评估转型或退出策略。' :
                     result.stage === 'shakeout' ? '洗牌期竞争加剧，巩固护城河。' :
                     result.stage === 'maturity' ? '成熟期市场增长放缓，优化效率而非扩张。' :
                     '成长期市场快速增长，加速抢占份额。',
        detectedAt: checkedAt,
      });

      return findings;
    } catch (err: unknown) {
      log.error({ err }, '[market-lifecycle] check 失败');
      return [{
        id: `e1-error-${now.getTime()}`, severity: 'warning',
        title: '市场生命周期检测异常',
        description: `${(err as Error)?.message || String(err)}`,
        evidence: [], suggestion: '检查 SOG 图数据源。', detectedAt: checkedAt,
      }];
    }
  },
};
