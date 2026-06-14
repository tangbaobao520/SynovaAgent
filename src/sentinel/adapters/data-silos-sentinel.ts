/**
 * sentinel/adapters/data-silos-sentinel.ts — 数据孤岛哨兵 (D4)
 * @state: real
 *
 * 检测本体层中系统间的数据流通断点。不需要外部连接器——查询 SOG 图中的跨系统引用缺失。
 * 每月1日9:00巡检。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/data-silos');

const config: SentinelConfig = {
  id: 'sentinel-data-silos', name: '数据孤岛', description: '跨系统数据断点检测:孤立TOOL/无跨系统引用。数据源:SOG图。', category: 'data-quality', priority: 'P1', mode: 'cron', cron: '0 9 1 * *', requiredDataSources: ['sog_graph'], confidenceModel: 'deterministic', version: '1.0.0',
};

export const dataSilosSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const { now } = context; const checkedAt = now.toISOString(); const startTime = Date.now();
    try {
      const db = context.db as { prepare(sql: string): { all(): Array<Record<string, unknown>> } } | null;
      if (!db) return { sentinelId: config.id, ok: true, findings: [], durationMs: 0, checkedAt, degraded: true };
      let toolCount = 0; let isolatedTools: string[] = [];
      try {
        const toolRows = db.prepare("SELECT id, props FROM graph_nodes WHERE type = 'TOOL' AND props IS NOT NULL").all();
        toolCount = toolRows.length;
        for (const r of toolRows) {
          const edgeRows = db.prepare("SELECT COUNT(*) as c FROM graph_edges WHERE (source_id = ? OR target_id = ?) AND type = 'INTEGRATES'").all(r.id, r.id);
          if (!edgeRows[0]?.c) {
            const p = typeof r.props === 'string' ? JSON.parse(r.props as string) : (r.props || {});
            isolatedTools.push((p.name || r.id) as string);
          }
        }
      } catch { /* */ }
      if (toolCount === 0) return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - startTime, checkedAt, degraded: true };
      const findings: SentinelFinding[] = [];
      const isolatedRate = isolatedTools.length / toolCount;
      if (isolatedRate > 0.5) {
        findings.push({ id: `silo-critical-${now.getTime()}`, severity: 'critical', title: `${isolatedTools.length}/${toolCount} 个系统孤立 (${(isolatedRate*100).toFixed(0)}%)`, description: `超过一半的软件系统无任何集成。数据孤岛严重: ${isolatedTools.join(', ')}`, evidence: [`总系统: ${toolCount}`, `孤立: ${isolatedTools.length}`, `孤立率: ${(isolatedRate*100).toFixed(0)}%`], suggestion: '按业务优先级制定集成路线图，先连接核心业务系统。', detectedAt: checkedAt });
      } else if (isolatedRate > 0.25) {
        findings.push({ id: `silo-warn-${now.getTime()}`, severity: 'warning', title: `${isolatedTools.length} 个系统孤立 (${(isolatedRate*100).toFixed(0)}%)`, description: `${isolatedTools.length}个工具无集成: ${isolatedTools.slice(0,5).join(', ')}`, evidence: [`孤立数: ${isolatedTools.length}/${toolCount}`], suggestion: '评估孤立系统的业务影响，分批接入集成。', detectedAt: checkedAt });
      }
      return { sentinelId: config.id, ok: true, findings, durationMs: Date.now() - startTime, checkedAt, degraded: false };
    } catch (err: unknown) { return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - startTime, checkedAt, error: (err as Error)?.message || String(err), degraded: true }; }
  },
};
