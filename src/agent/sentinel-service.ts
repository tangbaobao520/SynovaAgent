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

// ═══ Service ═══

/** 查询哨兵发现列表 */
export function getSentinelFindings(query: FindingsQuery = {}): FindingsResponse {
  const runner = getGlobalSentinelRunner();
  if (!runner) {
    return { ok: false, total: 0, findings: [] };
  }

  // V4.2.2: collaboration-collector 桥接已删除（铁律46）— 降级跳过
  // 保留空函数体，返回空结果
  return { ok: false, total: 0, findings: [] };
}
