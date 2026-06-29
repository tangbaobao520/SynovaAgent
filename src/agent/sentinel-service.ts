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
            checkedAt: new Date(run.result.durationMs).toISOString(),
          });
        }
      }
    }

    // 排序: critical 优先, 按 detectedAt
    all.sort((a, b) => {
      const sev = { critical: 0, warning: 1, info: 2 };
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

    const aggregated = aggregateSignals(allFindings);
    return {
      ok: true,
      total: aggregated.aggregatedSignals.length,
      criticalCount: aggregated.criticalSignals,
      warningCount: aggregated.warningSignals,
      signals: aggregated.aggregatedSignals,
    };
  } catch (err: unknown) {
    log.warn({ err }, 'getAggregatedSignals 失败 — degraded');
    return { ok: false, total: 0, criticalCount: 0, warningCount: 0, signals: [] };
  }
}

/** 手动触发单个哨兵运行 */
export async function runSentinelOnce(sentinelId: string): Promise<RunOnceResponse> {
  try {
    const { getSentinelRegistry } = await import('../sentinel/registry');
    const registry = getSentinelRegistry();
    const sentinel = registry.get(sentinelId);
    if (!sentinel) return { ok: false, sentinelId, result: null, error: `哨兵不存在: ${sentinelId}` };

    const context = { db: undefined, now: new Date(), registry };
    const result = await sentinel.check(context);
    return { ok: true, sentinelId, result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, sentinelId, result: null, error: msg };
  }
}

/** 获取专家报告 (当前为占位) */
export function getSentinelExpertReports(): ExpertReportsResponse {
  return { ok: true, reports: [] };
}

/** 获取哨兵工单 (当前为占位) */
export function getSentinelTickets(): TicketsResponse {
  return { ok: true, tickets: [] };
}
