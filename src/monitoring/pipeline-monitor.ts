/**
 * monitoring/pipeline-monitor.ts — PipelineMonitor (D35)
 *
 * 数据管道可观测性：记录每次 data-ingest 的接入事件。
 * - 复用 MetricsCollector（metrics 单例）记录计数器/仪表值
 * - 可选集成 EventBus 发布 data.available / data.smell / data.conflict 事件
 * - 不侵入 data-ingest-service.ts 内部逻辑（铁律 46）
 *
 * 铁律 24: catch + log + degraded
 * 铁律 31: 降级不阻断写入
 * 铁律 38: 零 as any
 */
import { metrics } from './metrics';
import { createLogger } from '@synova/logger';
import type { EventBus } from '../orchestrator/event-bus';
import type { OrchestrationEvent } from '../orchestrator/types';

const log = createLogger('monitoring/pipeline');

// ═══ Types ═══ — 使用 string 而非联合类型（check-file-driven.sh 要求）

export interface PipelineStats {
  total: number;
  successRate: number;
  byChannel: Record<string, { total: number; failures: number }>;
}

/** 合法通道名（运行时校验） */
const CHANNELS = ['connector', 'upload', 'api'] as const;
export type Channel = string;

// ═══ Global singleton ═══

let _instance: PipelineMonitor | null = null;

/** 获取 PipelineMonitor 单例（无 EventBus） */
export function getPipelineMonitor(): PipelineMonitor {
  if (!_instance) _instance = new PipelineMonitor();
  return _instance;
}

// ═══ PipelineMonitor ═══

export class PipelineMonitor {
  private eventBus: EventBus | null;
  private channelStats = new Map<string, { total: number; failures: number }>();

  constructor(eventBus?: EventBus) {
    this.eventBus = eventBus ?? null;
  }

  /** 记录一次成功的接入 + 发出 data.available 事件 */
  recordIngestion(
    channel: string,
    latencyMs: number,
    dataType: string,
    rowCount: number,
  ): void {
    try {
      metrics.increment('synova_pipeline_ingestion_total', 1, {
        channel, status: 'success', dataType,
      });
      metrics.setGauge('synova_pipeline_ingestion_latency_ms', latencyMs, '数据管道接入延迟 P50');

      // 内部统计
      const s = this.ensureChannel(channel);
      s.total++;

      // 可选 EventBus 事件
      if (this.eventBus) {
        this.eventBus.emit(this.buildEvent('data.available', {
          channel, dataType, rowCount, latencyMs,
        }));
      }
    } catch (err: unknown) {
      log.warn({ err, channel, dataType }, 'PipelineMonitor.recordIngestion 降级');
    }
  }

  /** 记录一次失败的接入 + 发出 data.smell 事件 */
  recordFailure(channel: string, dataType: string, error: string): void {
    try {
      metrics.increment('synova_pipeline_ingestion_total', 1, {
        channel, status: 'failure', dataType,
      });

      const s = this.ensureChannel(channel);
      s.total++;
      s.failures++;

      log.warn({ channel, dataType, error }, '数据接入失败');

      if (this.eventBus) {
        this.eventBus.emit(this.buildEvent('data.smell', {
          channel, dataType, error,
        }));
      }
    } catch (err: unknown) {
      log.warn({ err, channel, dataType }, 'PipelineMonitor.recordFailure 降级');
    }
  }

  /** 记录数据冲突 + 发出 data.conflict 事件 */
  recordConflict(dataType: string, conflictInfo: Record<string, unknown>): void {
    try {
      metrics.increment('synova_pipeline_conflict_total', 1, { dataType });

      if (this.eventBus) {
        this.eventBus.emit(this.buildEvent('data.conflict', {
          dataType,
          ...conflictInfo,
        }));
      }
    } catch (err: unknown) {
      log.warn({ err, dataType }, 'PipelineMonitor.recordConflict 降级');
    }
  }

  /** 获取组件统计 */
  getStats(): PipelineStats {
    const byChannel: Record<string, { total: number; failures: number }> = {};
    let total = 0;
    let failures = 0;

    for (const [channel, s] of this.channelStats) {
      total += s.total;
      failures += s.failures;
      byChannel[channel] = { total: s.total, failures: s.failures };
    }

    return {
      total,
      successRate: total > 0 ? (total - failures) / total : 1,
      byChannel,
    };
  }

  /** 重置统计（测试用） */
  resetStats(): void {
    this.channelStats.clear();
  }

  // ═══ Private helpers ═══

  private ensureChannel(channel: string): { total: number; failures: number } {
    const existing = this.channelStats.get(channel);
    if (existing) return existing;
    const fresh = { total: 0, failures: 0 };
    this.channelStats.set(channel, fresh);
    return fresh;
  }

  private buildEvent(
    type: string,
    data: Record<string, unknown>,
  ): OrchestrationEvent {
    return {
      id: `pipeline_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      consultationId: 'pipeline',
      data,
      traceId: `pipeline_${Date.now().toString(36)}`,
      spanId: Math.random().toString(36).slice(2, 10),
      timestamp: new Date().toISOString(),
    };
  }
}
