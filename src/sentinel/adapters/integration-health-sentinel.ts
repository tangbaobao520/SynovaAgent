/**
 * sentinel/adapters/integration-health-sentinel.ts — 集成健康哨兵 (D4)
 * @state: real
 *
 * 检查 SOG 图中 TOOL 节点间的 edge 连通性。不需要外部连接器——本体层已有集成边数据。
 * 每日9:00巡检。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/integration');

const config: SentinelConfig = {
  id: 'sentinel-integration-health', name: '集成健康', description: '系统间集成状态:活跃连接/失败率/数据延迟/集成债务。数据源:SOG图集成边。', category: 'health', priority: 'P0', mode: 'cron', cron: '0 9 * * *', requiredDataSources: ['sog_graph'], confidenceModel: 'deterministic', version: '1.0.0',
};

export const integrationHealthSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const { now } = context; const checkedAt = now.toISOString(); const startTime = Date.now();
    try {
      const db = context.db as { prepare(sql: string): { all(): Array<Record<string, unknown>> } } | null;
      if (!db) return { sentinelId: config.id, ok: true, findings: [], durationMs: 0, checkedAt, degraded: true };
      let toolCount = 0; let edgeCount = 0; let brokenEdges = 0;
      try {
        const toolRows = db.prepare("SELECT COUNT(*) as c FROM graph_nodes WHERE type = 'TOOL'").all();
        toolCount = (toolRows[0]?.c as number) || 0;
        const edgeRows = db.prepare("SELECT props FROM graph_edges WHERE type = 'INTEGRATES' AND props IS NOT NULL").all();
        edgeCount = edgeRows.length;
        for (const r of edgeRows) {
          const p = typeof r.props === 'string' ? JSON.parse(r.props as string) : (r.props || {});
          if (p.status === 'broken' || p.status === 'down' || p.health === 'unhealthy' || (p.last_sync && Date.now() - new Date(p.last_sync as string).getTime() > 86400000)) { brokenEdges++; }
        }
      } catch { /* */ }
      const findings: SentinelFinding[] = [];
      if (toolCount === 0) return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - startTime, checkedAt, degraded: true };
      const healthRate = edgeCount > 0 ? 1 - brokenEdges / edgeCount : 1;
      if (healthRate < 0.5) {
        findings.push({ id: `int-broken-${now.getTime()}`, severity: 'critical', title: `集成健康度严重恶化 (${(healthRate*100).toFixed(0)}%)`, description: `${toolCount}个系统间${edgeCount}条集成边，${brokenEdges}条异常。数据可能在不同系统间断裂。`, evidence: [`工具数: ${toolCount}`, `集成边: ${edgeCount}`, `异常: ${brokenEdges}`], suggestion: '排查异常集成，修复数据同步链路。', detectedAt: checkedAt });
      } else if (healthRate < 0.8) {
        findings.push({ id: `int-debt-${now.getTime()}`, severity: 'warning', title: `集成健康度不足 (${(healthRate*100).toFixed(0)}%)`, description: `${brokenEdges}/${edgeCount} 条集成边异常。`, evidence: [`异常集成: ${brokenEdges}`], suggestion: '建立集成监控告警，定期检查同步状态。', detectedAt: checkedAt });
      }
      if (toolCount > 3 && edgeCount < toolCount / 2) {
        findings.push({ id: `int-debt-${now.getTime()}`, severity: 'warning', title: '集成债务: 工具多但集成少', description: `${toolCount}个工具仅${edgeCount}条集成边。大量系统孤立运行，数据分散。`, evidence: [`工具: ${toolCount}`, `集成: ${edgeCount}`, `集成率: ${(edgeCount/toolCount*100).toFixed(0)}%`], suggestion: '优先将高频协作的系统对建立集成。', detectedAt: checkedAt });
      }
      return { sentinelId: config.id, ok: true, findings, durationMs: Date.now() - startTime, checkedAt, degraded: false };
    } catch (err: unknown) { return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - startTime, checkedAt, error: (err as Error)?.message || String(err), degraded: true }; }
  },
};
