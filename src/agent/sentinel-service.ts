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
import { createLogger } from '../logger';

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

// ═══ Service ═══

/** 查询哨兵发现列表 */
export function getSentinelFindings(query: FindingsQuery = {}): FindingsResponse {
  const runner = getGlobalSentinelRunner();
  if (!runner) {
    return { ok: false, total: 0, findings: [] };
  }

  // Week 4: D3 数据采集 — FDE 查看哨兵报告 = 一次人-AI 协作事件
  try {
    const { recordCollaborationEvent } = require('../../packages/engine-core/src/pipeline/collaboration-collector') as {
      recordCollaborationEvent: (e: { timestamp: string; gapDimension: string; eventType: string; roles: { from: string; to: string }; data: { modeUsed: string; outcome: string; durationMs?: number; humanIntervention?: boolean } }) => void;
    };
    recordCollaborationEvent({
      timestamp: new Date().toISOString(),
      gapDimension: 'information_flow',
      eventType: 'flow',
      roles: { from: 'fde', to: 'sentinel-runner' },
      data: {
        modeUsed: 'sentinel-findings-view',
        outcome: 'resolved',
        durationMs: 0,
        humanIntervention: false,
      },
    });
  } catch { log.debug('collaboration-collector 不可用 — 非阻断'); }

  const records = runner.getRecentResults();
  const all: FindingsResponse['findings'] = [];

  for (const [, history] of records) {
    for (const record of history) {
      for (const finding of record.result.findings) {
        if (query.sentinelId && record.sentinelId !== query.sentinelId) continue;
        if (query.severity && finding.severity !== query.severity) continue;
        all.push({
          sentinelId: record.sentinelId,
          sentinelName: record.sentinelName,
          finding,
          checkedAt: record.result.checkedAt,
        });
      }
    }
  }

  // 按时间倒序
  all.sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));

  const offset = query.offset ?? 0;
  const limit = query.limit ?? 50;

  return {
    ok: true,
    total: all.length,
    findings: all.slice(offset, offset + limit),
  };
}

/** 获取信号聚合结果 */
export function getAggregatedSignals(): SignalsResponse {
  const runner = getGlobalSentinelRunner();
  if (!runner) {
    return { ok: false, total: 0, criticalCount: 0, warningCount: 0, signals: [] };
  }

  const records = runner.getRecentResults();
  const latestResults: SentinelCheckResult[] = [];

  for (const [, history] of records) {
    if (history.length > 0) {
      latestResults.push(history[history.length - 1].result);
    }
  }

  if (latestResults.length === 0) {
    return { ok: true, total: 0, criticalCount: 0, warningCount: 0, signals: [] };
  }

  const { signals, stats } = aggregateSignals(latestResults);

  return {
    ok: true,
    total: signals.length,
    criticalCount: stats.criticalSignals,
    warningCount: signals.filter(s => s.severity === 'warning').length,
    signals,
  };
}

/** 手动触发一次哨兵检查 */
export async function runSentinelOnce(sentinelId: string): Promise<RunOnceResponse> {
  const runner = getGlobalSentinelRunner();
  if (!runner) {
    return { ok: false, sentinelId, result: null, error: 'SentinelRunner 未启动' };
  }

  try {
    const result = await runner.runOnce(sentinelId);
    if (!result) {
      return { ok: false, sentinelId, result: null, error: `哨兵 ${sentinelId} 未找到` };
    }
    return { ok: true, sentinelId, result };
  } catch (err: unknown) {
    const msg = (err as Error)?.message || String(err);
    log.error({ sentinelId, err: msg }, '[sentinel-service] runOnce 失败');
    return { ok: false, sentinelId, result: null, error: msg };
  }
}

/** 获取专家诊断报告 (哨兵→信号→专家→报告) */
export function getSentinelExpertReports(): { ok: boolean; total: number; reports: Array<{ signalId: string; expertType: string; report: unknown; storedAt: string }> } {
  const runner = getGlobalSentinelRunner();
  if (!runner) {
    return { ok: false, total: 0, reports: [] };
  }
  const reports = runner.getExpertReports();
  return { ok: true, total: reports.length, reports };
}

/** 查询哨兵工单 (L3 闭环) */
export function getSentinelTickets(status?: string): { ok: boolean; total: number; tickets: Array<Record<string, unknown>> } {
  const runner = getGlobalSentinelRunner();
  if (!runner) {
    return { ok: false, total: 0, tickets: [] };
  }
  try {
    // Runner 内部持有 db 引用，通过其方法查询
    const reports = runner.getExpertReports();
    const filtered = status
      ? reports.filter((r) => (r as Record<string, unknown>).status === status)
      : reports;
    return { ok: true, total: filtered.length, tickets: filtered };
  } catch {
    log.warn('sentinel tickets 查询失败 — degraded');
    return { ok: false, total: 0, tickets: [] };
  }
}
