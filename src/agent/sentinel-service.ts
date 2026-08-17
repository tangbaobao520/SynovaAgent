/**
 * agent/sentinel-service.ts — Sentinel 数据服务 (L2)
 * @state: real
 *
 * L2 编排层对 L1 暴露的哨兵发现 + 信号 + 手动触发接口。
 * L1 (routes/) 通过此服务获取哨兵运行结果，不直接访问 L3 (sentinel/runner)。
 *
 * 铁律 39: L1→L2 ✅ | L2→L3 ✅
 */

import type { SentinelFinding, SentinelCheckResult } from '../sentinel/types';
import type { AggregatedSignal } from '../sentinel/signal-aggregator';
import { getGlobalSentinelRunner } from '../sentinel/runner';
import { aggregateSignals } from '../sentinel/signal-aggregator';
import { createLogger } from '@synova/logger';

const log = createLogger('agent/sentinel-service');

// ═══ Types ═══

export interface FindingsQuery {
  sentinelId?: string;
  severity?: 'critical' | 'warning' | 'info';
  limit?: number;
  offset?: number;
}

export interface FindingsResponse {
  ok: boolean;
  total: number;
  findings: Array<{
    sentinelId: string;
    sentinelName: string;
    finding: SentinelFinding;
    checkedAt: string;
  }>;
}

export interface SignalsResponse {
  ok: boolean;
  total: number;
  criticalCount: number;
  warningCount: number;
  signals: AggregatedSignal[];
}

export interface RunOnceResponse {
  ok: boolean;
  sentinelId: string;
  result: SentinelCheckResult | null;
  error?: string;
}

export interface ExpertReportsResponse {
  ok: boolean;
  reports: Array<{
    sentinelId: string;
    expert: string;
    summary: string;
    confidence: number;
    checkedAt: string;
  }>;
}

export interface TicketsResponse {
  ok: boolean;
  tickets: Array<{
    id: string;
    title: string;
    severity: 'critical' | 'warning' | 'info';
    createdAt: string;
  }>;
}

// ═══ Service ═══

/** 查询哨兵发现列表 */
export function getSentinelFindings(query: FindingsQuery = {}): FindingsResponse {
  const runner = getGlobalSentinelRunner();
  if (!runner) {
    return { ok: false, total: 0, findings: [] };
  }

  try {
    const records = runner.getRecentResults();
    const all: Array<{ sentinelId: string; sentinelName: string; finding: SentinelFinding; checkedAt: string }> = [];

    for (const [sentinelId, runs] of records) {
      for (const run of runs) {
        if (!run.result.findings) continue;
        for (const finding of run.result.findings) {
          if (query.severity && finding.severity !== query.severity) continue;
          all.push({
            sentinelId,
            sentinelName: run.sentinelName,
            finding,
            checkedAt: run.result.checkedAt,
          });
        }
      }
    }

    // 排序: critical 优先, 按 detectedAt
    all.sort((a, b) => {
      const sev: Record<string, number> = { emergency: 0, critical: 0, warning: 1, info: 2 };
      const sa = sev[a.finding.severity] ?? 3;
      const sb = sev[b.finding.severity] ?? 3;
      if (sa !== sb) return sa - sb;
      return b.finding.detectedAt.localeCompare(a.finding.detectedAt);
    });

    const total = all.length;
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const findings = all.slice(offset, offset + limit);

    return { ok: true, total, findings };
  } catch (err: unknown) {
    log.warn({ err }, 'getSentinelFindings 失败 — degraded');
    return { ok: false, total: 0, findings: [] };
  }
}

/** 获取聚合信号 */
export function getAggregatedSignals(): SignalsResponse {
  const runner = getGlobalSentinelRunner();
  if (!runner) return { ok: false, total: 0, criticalCount: 0, warningCount: 0, signals: [] };

  try {
    const allFindings: SentinelFinding[] = [];
    for (const runs of runner.getRecentResults().values()) {
      for (const run of runs) {
        if (run.result.findings) allFindings.push(...run.result.findings);
      }
    }
    if (allFindings.length === 0) return { ok: true, total: 0, criticalCount: 0, warningCount: 0, signals: [] };

    // 包装为 SentinelCheckResult 供 aggregateSignals 消费
    const checkResults: import('../sentinel/types').SentinelCheckResult[] = [{
      sentinelId: 'sentinel-service',
      ok: true,
      findings: allFindings,
      durationMs: 0,
      checkedAt: new Date().toISOString(),
    }];
    const aggregated = aggregateSignals(checkResults);
    return {
      ok: true,
      total: aggregated.signals.length,
      criticalCount: aggregated.stats.criticalSignals,
      warningCount: aggregated.signals.filter(s => s.severity === 'warning').length,
      signals: aggregated.signals,
    };
  } catch (err: unknown) {
    log.warn({ err }, 'getAggregatedSignals 失败 — degraded');
    return { ok: false, total: 0, criticalCount: 0, warningCount: 0, signals: [] };
  }
}

/** 手动触发单个哨兵运行 (ID 兼容: 同时接受 'sentinel-xxx' 和 'xxx' 格式) */
export async function runSentinelOnce(sentinelId: string): Promise<RunOnceResponse> {
  try {
    const { getSentinelRegistry } = await import('../sentinel/registry');
    const registry = getSentinelRegistry();
    // 先尝试原始 ID, 再尝试带 sentinel- 前缀的完整 ID
    let sentinel = registry.get(sentinelId);
    if (!sentinel && !sentinelId.startsWith('sentinel-')) {
      sentinel = registry.get(`sentinel-${sentinelId}`);
      if (sentinel) sentinelId = `sentinel-${sentinelId}`;
    }
    if (!sentinel) return { ok: false, sentinelId, result: null, error: `哨兵不存在: ${sentinelId}` };

    // D453: 修复 db:undefined → 哨兵空 store。构造 GraphStore 上下文（对齐 runner.ts:835-852）。
    // 降级: GraphStore 构造失败 → 回退原始 db（log.warn，不静默，铁律 24/31）。
    const { getDatabase } = await import('../init/engine-context');
    const rawDb = getDatabase();
    let graphCtx: unknown = rawDb;
    if (typeof rawDb === 'object' && rawDb !== null && !('queryNodes' in rawDb)) {
      try {
        const { SqliteGraphStore } = await import('../adapters/sqlite-graph-store');
        graphCtx = new SqliteGraphStore(rawDb);
      } catch (err: unknown) {
        log.warn({ err: err instanceof Error ? err.message : String(err) }, '[runSentinelOnce] GraphStore 创建失败 — 降级至原始 db');
        graphCtx = rawDb;
      }
    }
    const context = { db: graphCtx, now: new Date(), registry };
    const result = await sentinel.check(context);
    return { ok: true, sentinelId, result };
  } catch (err: unknown) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "动态模块加载失败");
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, sentinelId, result: null, error: msg };
  }
}

/** 获取专家报告 (从最近哨兵运行结果提取) */
export function getSentinelExpertReports(): ExpertReportsResponse {
  const runner = getGlobalSentinelRunner();
  if (!runner) return { ok: true, reports: [] };
  try {
    const reports: ExpertReportsResponse['reports'] = [];
    for (const [sentinelId, runs] of runner.getRecentResults()) {
      for (const run of runs) {
        if (!run.result.findings) continue;
        for (const f of run.result.findings) {
          reports.push({
            sentinelId,
            expert: f.relatedNodeId || '专家',
            summary: f.description.slice(0, 200),
            confidence: 0.7,
            checkedAt: f.detectedAt,
          });
        }
      }
    }
    return { ok: true, reports: reports.slice(0, 50) };
  } catch (err: unknown) {
    log.warn({ err }, 'getSentinelExpertReports 失败 — degraded');
    return { ok: true, reports: [] };
  }
}

/** 获取哨兵工单 */
export function getSentinelTickets(): TicketsResponse {
  const runner = getGlobalSentinelRunner();
  if (!runner) return { ok: true, tickets: [] };
  try {
    // 从上轮运行结果提取 tickets
    const tickets: TicketsResponse['tickets'] = [];
    for (const [sentinelId, runs] of runner.getRecentResults()) {
      for (const run of runs) {
        if (!run.result.findings) continue;
        for (const f of run.result.findings) {
          if (f.severity === 'critical' || f.severity === 'warning') {
            tickets.push({
              id: `${sentinelId}_${f.id}`,
              title: f.title,
              severity: f.severity === 'critical' ? 'critical' : 'warning',
              createdAt: f.detectedAt,
            });
          }
        }
      }
    }
    return { ok: true, tickets: tickets.slice(0, 20) };
  } catch (err: unknown) {
    log.warn({ err }, 'getSentinelTickets 失败 — degraded');
    return { ok: true, tickets: [] };
  }
}
