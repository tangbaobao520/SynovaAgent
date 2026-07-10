/**
 * competitive-dynamics/aggregate.ts — E3 竞争格局变化哨兵
 */
import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeHhiIndex } from './computes/hhi-index';
import { computeCompetitiveIntensity } from './computes/competitive-intensity';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/competitive-dynamics');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const competitiveDynamicsSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date();
    const checkedAt = now.toISOString();
    const findings: SentinelFinding[] = [];

    try {
      let marketNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
      let finNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
      let usedTraversal = false;
      try { if (traversal) { const r = traversal.traverse([teamId], ['OPERATIONAL_EXECUTION', 'INFORMATION_FLOW']); if (r.nodes[0]) { marketNodes = r.nodes.filter(n => n.type === 'MARKET_OUTCOME' || n.type === 'COMPETITIVE_OUTCOME'); finNodes = r.nodes; usedTraversal = true; } } } catch (err: unknown) { log.warn({ err, teamId }, '图遍历失败 — 降级到旧路径'); }
      if (!usedTraversal) { marketNodes = store.queryNodes('Event', { teamId }); finNodes = store.queryNodes('Financial', { teamId }); }

      const competitors = [...marketNodes, ...finNodes].map(n => ({
        name: (n.props.name as string) || n.id,
        revenue: Number(n.props.revenue) || Number(n.props.amount) || 0,
      }));

      const hhi = computeHhiIndex(competitors);
      log.debug({ hhi: hhi.hhi, concentration: hhi.concentration }, 'HHI计算完成');

      if (!hhi.degraded) {
        if (hhi.concentration === 'high') {
          findings.push({
            id: `e3-hhi-${now.getTime()}`, severity: 'warning',
            title: `市场高度集中 (HHI=${hhi.hhi})`,
            description: `HHI > 2500, 少数企业主导市场。`,
            evidence: [`HHI: ${hhi.hhi}`, ...hhi.marketShareChanges.slice(0, 5).map(s => `${s.name}: ${(s.share * 100).toFixed(0)}%`)],
            suggestion: '高度集中市场需关注反垄断风险和定价权。', detectedAt: checkedAt,
          });
        }
      }

      // 从 marketNodes 中提取竞争动态数据
      const recentEntries = marketNodes.reduce((s, n) => s + (Number(n.props.recentEntries) || 0), 0);
      const recentExits = marketNodes.reduce((s, n) => s + (Number(n.props.recentExits) || 0), 0);
      const marketGrowth = marketNodes.length > 0
        ? marketNodes.reduce((s, n) => s + (Number(n.props.growthRate) || Number(n.props.amount) || 0), 0) / marketNodes.length
        : 0.05;
      const intensity = computeCompetitiveIntensity({
        competitorCount: competitors.length,
        recentEntries: recentEntries || 1,
        recentExits: recentExits || 1,
        marketGrowth: marketGrowth || 0.05,
      });
      log.debug({ intensity: intensity.intensity }, '竞争强度计算');

      if (!intensity.degraded && intensity.intensity > 0.7) {
        findings.push({
          id: `e3-intensity-${now.getTime()}`, severity: 'warning',
          title: `竞争强度高 (${(intensity.intensity * 100).toFixed(0)}%)`,
          description: `${intensity.competitorCount} 个竞争者，竞争激烈。`,
          evidence: [`强度: ${(intensity.intensity * 100).toFixed(0)}%`, `竞争者: ${intensity.competitorCount}`],
          suggestion: '竞争激烈阶段需强化差异化。', detectedAt: checkedAt,
        });
      }

      return findings;
    } catch (err: unknown) {
      log.error({ err }, '[competitive-dynamics] check 失败');
      return [{ id: `e3-error-${now.getTime()}`, severity: 'warning', title: '竞争格局检测异常', description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt }];
    }
  },
};
