/**
 * monitoring/freshness-tracker.ts — FreshnessTracker (D35)
 *
 * 数据源新鲜度追踪：记录每个 data source 的最后更新时间，
 * 对比预期更新频率计算延迟状态 (green/yellow/orange/red)。
 *
 * 铁律 24: catch + log + degraded
 * 铁律 38: 零 as any
 */
import { createLogger } from '@synova/logger';
import type { EventBus } from '../orchestrator/event-bus';
import type { OrchestrationEvent } from '../orchestrator/types';

const log = createLogger('monitoring/freshness');

// ═══ Types ═══ — 使用 string 而非联合类型（check-file-driven.sh 要求）

/** 合法更新频率 */
export const EXPECTED_FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly'] as const;
export type ExpectedFrequency = string;

/** 合法新鲜度状态 */
export const FRESHNESS_STATUSES = ['green', 'yellow', 'orange', 'red'] as const;
export type FreshnessStatus = string;

export interface FreshnessRecord {
  sourceId: string;
  poolName: string;
  lastUpdatedAt: string;
  expectedFrequency: ExpectedFrequency;
  freshnessStatus: FreshnessStatus;
  delayDays: number;
}

interface SourceState {
  poolName: string;
  lastUpdatedAt: number; // timestamp ms
  expectedFrequency: ExpectedFrequency;
  lastEventEmitted: FreshnessStatus | null; // 避免重复事件
}

// 各频率的"天数→状态"阈值
const STATUS_THRESHOLDS: Record<string, Array<[number, FreshnessStatus]>> = {
  daily:     [[1, 'green'],  [2, 'yellow'],  [5, 'orange'],  [Infinity, 'red']],
  weekly:    [[7, 'green'],  [10, 'yellow'], [21, 'orange'], [Infinity, 'red']],
  monthly:   [[30, 'green'], [45, 'yellow'], [60, 'orange'], [Infinity, 'red']],
  quarterly: [[90, 'green'], [120, 'yellow'], [180, 'orange'], [Infinity, 'red']],
};

function daysBetween(a: number, b: number): number {
  return Math.max(0, (b - a) / 86_400_000);
}

function computeStatus(elapsedDays: number, freq: string): FreshnessStatus {
  const thresholds = STATUS_THRESHOLDS[freq];
  if (!thresholds) return 'red';
  for (const [threshold, status] of thresholds) {
    if (elapsedDays <= threshold) return status;
  }
  return 'red';
}

// ═══ FreshnessTracker ═══

export class FreshnessTracker {
  private sources = new Map<string, SourceState>();
  private eventBus: EventBus | null;

  constructor(eventBus?: EventBus) {
    this.eventBus = eventBus ?? null;
  }

  /** 记录一次数据源更新 */
  recordUpdate(sourceId: string, poolName: string, expectedFreq: string): void {
    try {
      const now = Date.now();
      this.sources.set(sourceId, {
        poolName,
        lastUpdatedAt: now,
        expectedFrequency: expectedFreq,
        lastEventEmitted: null,
      });
      log.debug({ sourceId, poolName }, '数据源新鲜度已更新');
    } catch (err: unknown) {
      log.warn({ err, sourceId }, 'FreshnessTracker.recordUpdate 降级');
    }
  }

  /** 获取指定 pool 的所有源的新鲜度 */
  getStatusByPool(poolName: string): FreshnessRecord[] {
    try {
      const now = Date.now();
      const results: FreshnessRecord[] = [];

      for (const [sourceId, state] of this.sources) {
        if (state.poolName !== poolName) continue;
        const elapsedDays = daysBetween(state.lastUpdatedAt, now);
        const status = computeStatus(elapsedDays, state.expectedFrequency);
        results.push({
          sourceId,
          poolName: state.poolName,
          lastUpdatedAt: new Date(state.lastUpdatedAt).toISOString(),
          expectedFrequency: state.expectedFrequency,
          freshnessStatus: status,
          delayDays: Math.round(elapsedDays),
        });
      }

      return results;
    } catch (err: unknown) {
      log.warn({ err, poolName }, 'FreshnessTracker.getStatusByPool 降级');
      return [];
    }
  }

  /** 获取所有不新鲜的数据源 (status !== 'green') */
  getDegradedSources(): FreshnessRecord[] {
    try {
      const now = Date.now();
      const results: FreshnessRecord[] = [];

      for (const [sourceId, state] of this.sources) {
        const elapsedDays = daysBetween(state.lastUpdatedAt, now);
        const status = computeStatus(elapsedDays, state.expectedFrequency);
        if (status === 'green') continue;

        const record: FreshnessRecord = {
          sourceId,
          poolName: state.poolName,
          lastUpdatedAt: new Date(state.lastUpdatedAt).toISOString(),
          expectedFrequency: state.expectedFrequency,
          freshnessStatus: status,
          delayDays: Math.round(elapsedDays),
        };
        results.push(record);

        // 新鲜度降级 → 首次或升级时发射事件
        this.emitDegradedIfNeeded(sourceId, state, status, record);
      }

      return results;
    } catch (err: unknown) {
      log.warn({ err }, 'FreshnessTracker.getDegradedSources 降级');
      return [];
    }
  }

  /** 返回所有数据源的原始状态（指标用） */
  getAllSources(): Map<string, { poolName: string; lastUpdatedAt: number; expectedFrequency: string }> {
    return new Map([...this.sources.entries()].map(([id, s]) => [
      id,
      { poolName: s.poolName, lastUpdatedAt: s.lastUpdatedAt, expectedFrequency: s.expectedFrequency },
    ]));
  }

  /** 重置（测试用） */
  reset(): void {
    this.sources.clear();
  }

  // ═══ Private ═══

  private emitDegradedIfNeeded(
    sourceId: string,
    state: SourceState,
    currentStatus: FreshnessStatus,
    record: FreshnessRecord,
  ): void {
    if (!this.eventBus) return;
    if (state.lastEventEmitted === currentStatus) return; // 已发射过该级别

    try {
      this.eventBus.emit(this.buildFreshnessEvent('freshness.degraded', record));
      state.lastEventEmitted = currentStatus;
      log.warn({ sourceId, status: currentStatus, delayDays: record.delayDays }, '新鲜度降级事件已发射');
    } catch (err: unknown) {
      log.warn({ err, sourceId }, '发射 freshness.degraded 事件失败');
    }
  }

  private buildFreshnessEvent(
    type: string,
    record: FreshnessRecord,
  ): OrchestrationEvent {
    return {
      id: `freshness_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      consultationId: 'pipeline',
      data: { ...record },
      traceId: `pipeline_${Date.now().toString(36)}`,
      spanId: Math.random().toString(36).slice(2, 10),
      timestamp: new Date().toISOString(),
    };
  }
}
