/**
 * engine-server/pipeline/collaboration-collector.ts — 运行时协作事件采集（V1.2 第二阶段）
 *
 * 在 Protocol Engine 中间件的消息流上埋 6 缝隙维度计数器。
 * 用内存存储（轻量级，生产环境可替换为 SQLite/Redis），供 M3 进化引擎消费。
 *
 * 采集维度（6 缝隙）：
 * 1. division_of_labor       — 角色间任务传递
 * 2. information_flow        — 信息流方向 + 延迟
 * 3. authority_governance    — 冲突解决策略 + 决策权限使用
 * 4. trust_incentive         — 激励信号匹配度 + 信任降级触发
 * 5. knowledge_sharing       — 知识共享方向
 * 6. external_interface      — 外部接口调用审计
 *
 * @packageDocumentation
 */

import type { GapDimension, RuntimeCollaborationEvent, EvolutionSignal } from './schema-bridge';
import { createLogger } from '../infra/logger';

const log = createLogger('engine-server/pipeline/collaboration-collector');

// ====================================================================
// 内存存储
// ====================================================================

interface DimensionCounter {
  dimension: GapDimension;
  totalEvents: number;
  modeUsed: string;
  outcomes: { resolved: number; escalated: number; deadlocked: number };
  humanInterventions: number;
  totalDurationMs: number;
  lastEventAt: string;
}

const counters: Map<GapDimension, DimensionCounter> = new Map();

function ensureCounter(dim: GapDimension, mode: string): DimensionCounter {
  let c = counters.get(dim);
  if (!c) {
    c = {
      dimension: dim,
      totalEvents: 0,
      modeUsed: mode,
      outcomes: { resolved: 0, escalated: 0, deadlocked: 0 },
      humanInterventions: 0,
      totalDurationMs: 0,
      lastEventAt: '',
    };
    counters.set(dim, c);
  }
  return c;
}

const eventLog: RuntimeCollaborationEvent[] = [];
const MAX_EVENT_LOG = 1000; // 保留最近 1000 条事件，防止内存泄漏

// ====================================================================
// 事件采集
// ====================================================================

/**
 * 记录一次运行时协作事件。
 * 由 Protocol Engine 中间件在 Agent 间消息路由时调用。
 */
export function recordCollaborationEvent(event: RuntimeCollaborationEvent): void {
  const c = ensureCounter(event.gapDimension, event.data.modeUsed);
  c.totalEvents++;
  c.modeUsed = event.data.modeUsed;
  c.outcomes[event.data.outcome] = (c.outcomes[event.data.outcome] || 0) + 1;
  if (event.data.humanIntervention) c.humanInterventions++;
  if (event.data.durationMs) c.totalDurationMs += event.data.durationMs;
  c.lastEventAt = event.timestamp;

  eventLog.push(event);
  if (eventLog.length > MAX_EVENT_LOG) {
    eventLog.splice(0, eventLog.length - MAX_EVENT_LOG);
  }

  // HONA feeder: record agent-to-agent interaction
  if (event.roles?.from && event.roles?.to) {
    try {
      // Lazy import to avoid circular dependency
      const { recordAgentInteraction } = require('./diagnosis/hona') as {
        recordAgentInteraction: (from: string, to: string) => void;
      };
      recordAgentInteraction(event.roles.from, event.roles.to);
    } catch { log.debug('[collaboration-collector] HONA unavailable, skipping agent interaction recording'); /* HONA unavailable — ignore */ }
  }
}

// ====================================================================
// 信号聚合 → 进化引擎输入
// ====================================================================

/**
 * 采集所有维度的当前计数器快照，聚合为进化信号列表。
 * 由 M3 进化引擎定期轮询消费。
 */
export function collectEvolutionSignals(): EvolutionSignal[] {
  const signals: EvolutionSignal[] = [];
  const now = new Date().toISOString();

  for (const [dim, counter] of counters) {
    if (counter.totalEvents === 0) continue;

    // 冲突率 → 信号强度
    const conflictRate = counter.outcomes.deadlocked / Math.max(counter.totalEvents, 1);
    const escalateRate = counter.outcomes.escalated / Math.max(counter.totalEvents, 1);
    const interventionRate = counter.humanInterventions / Math.max(counter.totalEvents, 1);

    let signalStrength = 0;
    let signalType: EvolutionSignal['signalType'] = 'mode_conflict';
    let suggestedAction: EvolutionSignal['suggestedAction'] = 'keep';

    if (conflictRate > 0.3) {
      signalStrength = conflictRate;
      signalType = 'deadlock_frequent';
      suggestedAction = 'generate_variant';
    } else if (escalateRate > 0.5) {
      signalStrength = escalateRate;
      signalType = 'mode_conflict';
      suggestedAction = 'degrade_confidence';
    } else if (interventionRate > 0.3) {
      signalStrength = interventionRate;
      signalType = 'overridden';
      suggestedAction = 'replace_mode';
    } else if (conflictRate > 0.1) {
      signalStrength = conflictRate * 0.5;
      signalType = 'satisfaction_drop';
      suggestedAction = 'keep';
    }

    if (signalStrength > 0) {
      signals.push({
        gapDimension: dim,
        currentMode: counter.modeUsed,
        signalStrength: Math.min(signalStrength, 1),
        signalType,
        suggestedAction,
        sampleSize: counter.totalEvents,
        latestEventAt: counter.lastEventAt,
      });
    }
  }

  return signals;
}

// ====================================================================
// 查询接口
// ====================================================================

/** 获取指定维度的统计 */
export function getDimensionStats(dim: GapDimension): DimensionCounter | undefined {
  return counters.get(dim);
}

/** 获取所有维度统计 */
export function getAllStats(): Record<string, DimensionCounter> {
  const result: Record<string, DimensionCounter> = {};
  for (const [dim, c] of counters) {
    result[dim] = { ...c };
  }
  return result;
}

/** 获取最近 N 条事件 */
export function getRecentEvents(n: number = 50): RuntimeCollaborationEvent[] {
  return eventLog.slice(-n);
}

/** 重置所有计数器（用于测试） */
export function resetCollector(): void {
  counters.clear();
  eventLog.length = 0;
}

/** 获取事件总数 */
export function getTotalEventCount(): number {
  return eventLog.length;
}
