/**
 * sentinel/adapters/data-silos-sentinel.ts — 数据孤岛哨兵 (D4)
 * @state: real
 *
 * 检测企业软件系统之间的数据流通情况：哪些系统没有对外连接、数据是否在孤岛中。
 * 每日 8:00 巡检。数据源: SOG 图节点+边。
 */
import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/data-silos');

const config: SentinelConfig = {
  id: 'sentinel-data-silos', name: '数据孤岛',
  description: '检测系统间数据流通: 无出边的隔离节点、手动数据搬运模式。数据源: SOG图边。',
  category: 'health', priority: 'P1', mode: 'cron', cron: '0 8 * * *',
  requiredDataSources: ['sog_graph'], confidenceModel: 'deterministic', version: '1.0.0',
};

export const dataSilosSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const { now } = context; const checkedAt = now.toISOString(); const startTime = Date.now();
    try {
      const db = context.db as { prepare(sql: string): { all(): Array<Record<string, unknown>> } } | null;
      if (!db) { return { sentinelId: config.id, ok: true, findings: [], durationMs: 0, checkedAt, degraded: true }; }

      // 查询软件节点
      let systems: Array<{ id: string; name: string }> = [];
      try {
        const rows = db.prepare(
          "SELECT id, props FROM graph_nodes WHERE (type = 'TOOL' OR type = 'APP' OR type = 'SOFTWARE' OR type = 'SYSTEM') AND props IS NOT NULL"
        ).all();
        for (const r of rows) {
          const props = typeof r.props === 'string' ? JSON.parse(r.props as string) : (r.props || {});
          systems.push({ id: r.id as string, name: (props.name || r.id) as string });
        }
      } catch { return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - startTime, checkedAt, degraded: true }; }

      if (systems.length < 2) {
        return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - startTime, checkedAt, degraded: false };
      }

      // 查询数据流边 (DATA_FLOW / INTEGRATES / CONNECTS_TO)
      let edges: Array<{ from: string; to: string }> = [];
      try {
        const rows = db.prepare(
          "SELECT props FROM graph_edges WHERE (type = 'DATA_FLOW' OR type = 'INTEGRATES' OR type = 'CONNECTS_TO')"
        ).all();
        for (const r of rows) {
          const props = typeof r.props === 'string' ? JSON.parse(r.props as string) : (r.props || {});
          if (props.from && props.to) edges.push({ from: props.from as string, to: props.to as string });
        }
      } catch { /* 边表可能不存在或为空 */ }

      // 找出孤岛节点 (没有出边也没有入边的系统)
      const connected = new Set<string>();
      for (const e of edges) { connected.add(e.from); connected.add(e.to); }
      const silos = systems.filter(s => !connected.has(s.id) && !connected.has(s.name));

      const findings: SentinelFinding[] = [];
      const siloRate = silos.length / systems.length;

      if (siloRate > 0.5) {
        findings.push({
          id: `ds-critical-${now.getTime()}`, severity: 'critical',
          title: `数据孤岛严重: ${silos.length}/${systems.length} 个系统无数据连接 (${(siloRate * 100).toFixed(0)}%)`,
          description: `以下系统与其他系统无数据流通: ${silos.map(s => s.name).join(', ')}`,
          evidence: [`总系统: ${systems.length}`, `孤岛: ${silos.length}`, `有连接: ${systems.length - silos.length}`],
          suggestion: '优先打通核心业务系统之间的数据流。建议从 CRM↔财务 和 人事↔协作 开始。',
          detectedAt: checkedAt,
        });
      } else if (silos.length > 0) {
        findings.push({
          id: `ds-warn-${now.getTime()}`, severity: 'warning',
          title: `${silos.length} 个系统处于数据孤岛状态`,
          description: `孤岛系统: ${silos.map(s => s.name).join(', ')}`,
          evidence: silos.map(s => `${s.name}: 无数据流入/流出`),
          suggestion: '评估这些系统是否需要与其他系统对接。如果不需要，标注为"独立系统"。',
          detectedAt: checkedAt,
        });
      }

      // 连接密度检查
      const maxEdges = systems.length * (systems.length - 1);
      const density = maxEdges > 0 ? edges.length / maxEdges : 0;
      if (systems.length >= 4 && density < 0.15) {
        findings.push({
          id: `ds-density-${now.getTime()}`, severity: 'warning',
          title: `系统间连接密度极低 (${(density * 100).toFixed(1)}%)`,
          description: `${systems.length} 个系统间仅 ${edges.length} 条数据流边。数据可能依赖手动搬运。`,
          evidence: [`系统数: ${systems.length}`, `数据流边: ${edges.length}`, `理论最大边: ${maxEdges}`],
          suggestion: '手动数据搬运(Excel导入导出)效率低且易出错。考虑自动化高频数据流。',
          detectedAt: checkedAt,
        });
      }

      return { sentinelId: config.id, ok: true, findings, durationMs: Date.now() - startTime, checkedAt, degraded: false };
    } catch (err: unknown) {
      return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - startTime, checkedAt, error: (err as Error)?.message || String(err), degraded: true };
    }
  },
};
