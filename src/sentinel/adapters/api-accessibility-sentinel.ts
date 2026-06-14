/**
 * sentinel/adapters/api-accessibility-sentinel.ts — API 可访问性哨兵 (D5)
 * @state: real
 *
 * 检测企业软件系统的 API 可达性。不需要外部连接器——用 HTTP HEAD 请求检查。
 * 每日 9:00 巡检。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/api-access');

const config: SentinelConfig = {
  id: 'sentinel-api-accessibility', name: 'API 可访问性', description: '检测在用的 SaaS/内部系统 API 可达率。数据源: SOG 图 + HTTP HEAD。', category: 'health', priority: 'P1', mode: 'cron', cron: '0 9 * * *', requiredDataSources: ['sog_graph', 'network'], confidenceModel: 'deterministic', version: '1.0.0',
};

export const apiAccessibilitySentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const { now } = context; const checkedAt = now.toISOString(); const startTime = Date.now();
    try {
      // 从 SOG 图中读取系统节点
      const db = context.db as { prepare(sql: string): { all(): Array<Record<string, unknown>> } } | null;
      const systems: Array<{ id: string; name: string; url?: string }> = [];
      if (db) {
        try {
          const rows = db.prepare("SELECT id, props FROM graph_nodes WHERE type = 'TOOL' AND props IS NOT NULL").all();
          for (const r of rows) {
            const props = typeof r.props === 'string' ? JSON.parse(r.props as string) : (r.props || {});
            if (props.url || props.endpoint) { systems.push({ id: r.id as string, name: (props.name || r.id) as string, url: (props.url || props.endpoint) as string }); }
          }
        } catch { log.debug('API 可访问性: 表不存在或无数据'); }
      }
      if (systems.length === 0) {
        return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - startTime, checkedAt, degraded: true };
      }
      const reachable: string[] = []; const unreachable: string[] = [];
      for (const sys of systems) {
        try {
          const url = sys.url!.startsWith('http') ? sys.url! : `https://${sys.url!}`;
          const controller = new AbortController(); const to = setTimeout(() => controller.abort(), 5000);
          const resp = await fetch(url, { method: 'HEAD', signal: controller.signal });
          clearTimeout(to);
          if (resp.ok) { reachable.push(sys.name); } else { unreachable.push(`${sys.name} (HTTP ${resp.status})`); }
        } catch { unreachable.push(`${sys.name} (不可达)`); }
      }
      const rate = reachable.length / systems.length;
      const findings: SentinelFinding[] = [];
      if (rate < 0.6) {
        findings.push({ id: `api-low-${now.getTime()}`, severity: 'critical', title: `API 可达率过低 (${(rate * 100).toFixed(0)}%)`, description: `${systems.length} 个系统中仅 ${reachable.length} 个可达。不可达: ${unreachable.join(', ')}`, evidence: [`可达: ${reachable.join(', ')}`, `不可达: ${unreachable.join(', ')}`], suggestion: '检查网络策略和服务状态。API 可达率 <60% 意味着 Agent 无法正常调用企业系统。', detectedAt: checkedAt });
      } else if (rate < 0.8) {
        findings.push({ id: `api-warn-${now.getTime()}`, severity: 'warning', title: `API 可达率偏低 (${(rate * 100).toFixed(0)}%)`, description: `${unreachable.length}/${systems.length} 个系统不可达`, evidence: [`不可达: ${unreachable.join(', ')}`], suggestion: '排查不可达系统，检查认证和网络配置。', detectedAt: checkedAt });
      }
      return { sentinelId: config.id, ok: true, findings, durationMs: Date.now() - startTime, checkedAt, degraded: false };
    } catch (err: unknown) {
      return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - startTime, checkedAt, error: (err as Error)?.message || String(err), degraded: true };
    }
  },
};
