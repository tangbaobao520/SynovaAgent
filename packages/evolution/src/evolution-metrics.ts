/**
 * evolution-metrics.ts — L0 进化引擎可观测性
 *
 * 纯内存指标收集器 + 环形操作日志。
 * 零外部依赖（不依赖 Prometheus/OpenTelemetry）。
 *
 * 两个核心能力：
 *   1. 计数器快照 — 提供进化引擎运行状态的实时概览
 *   2. 操作日志 — 最近 N 条操作的环形缓冲区，用于排查问题
 *
 * 铁律 24+31: 计数器即使溢出也不影响业务逻辑（degraded-safe）
 */

import { createLogger } from '@synova/logger';

const log = createLogger('evolution/metrics');

// ═══ 常量 ═══

const MAX_LOG_ENTRIES = 1000;

// ═══ 类型 ═══

export interface MetricsSnapshot {
  /** 自引擎启动以来的累计值 */
  counters: {
    /** 处理过的用户纠错总数 */
    correctionsProcessed: number;
    /** 阈值调整次数 */
    thresholdsAdjusted: number;
    /** 涉及的唯一哨兵数量 */
    sentinelsAdjusted: number;
    /** 创建的提案总数 */
    proposalsCreated: number;
    /** 审批通过的提案数 */
    proposalsApproved: number;
    /** 拒绝的提案数 */
    proposalsRejected: number;
    /** 发生的错误总数 */
    errors: number;
    /** 被冷却期跳过的调整次数 */
    coolingPeriodSkips: number;
    /** 被边界保护的调整次数 */
    boundProtections: number;
  };
  /** 引擎启动时间 */
  startedAt: string;
  /** 最近的操作日志条目 */
  recentLogs: OperationLogEntry[];
}

export interface OperationLogEntry {
  timestamp: string;
  type: 'correction' | 'threshold_adjust' | 'proposal_create' | 'proposal_approve' | 'proposal_reject' | 'error' | 'cooling_skip' | 'bound_protect';
  detail: string;
  /** 关联的 sentinelId 或 proposalId */
  ref?: string;
}

// ═══ EvolutionMetrics ═══

let instance: EvolutionMetrics | null = null;

export class EvolutionMetrics {
  private counters = {
    correctionsProcessed: 0,
    thresholdsAdjusted: 0,
    sentinelsAdjusted: 0,
    proposalsCreated: 0,
    proposalsApproved: 0,
    proposalsRejected: 0,
    errors: 0,
    coolingPeriodSkips: 0,
    boundProtections: 0,
  };
  private startedAt = new Date().toISOString();
  private logRing: OperationLogEntry[] = [];
  private adjustedSentinels = new Set<string>();

  /** 获取全局单例 */
  static getInstance(): EvolutionMetrics {
    if (!instance) instance = new EvolutionMetrics();
    return instance;
  }

  /** 重置所有计数器（测试用） */
  reset(): void {
    this.counters = {
      correctionsProcessed: 0, thresholdsAdjusted: 0, sentinelsAdjusted: 0,
      proposalsCreated: 0, proposalsApproved: 0, proposalsRejected: 0,
      errors: 0, coolingPeriodSkips: 0, boundProtections: 0,
    };
    this.adjustedSentinels.clear();
    this.logRing = [];
    this.startedAt = new Date().toISOString();
  }

  // ═══ 记录方法 ═══

  recordCorrection(): void {
    this.counters.correctionsProcessed++;
  }

  recordThresholdAdjustment(sentinelId: string, oldVal: number, newVal: number): void {
    this.counters.thresholdsAdjusted++;
    if (!this.adjustedSentinels.has(sentinelId)) {
      this.adjustedSentinels.add(sentinelId);
      this.counters.sentinelsAdjusted++;
    }
    this.addLog('threshold_adjust', `${sentinelId}: ${oldVal}→${newVal}`, sentinelId);
  }

  recordProposalCreate(detail: string, ref?: string): void {
    this.counters.proposalsCreated++;
    this.addLog('proposal_create', detail, ref);
  }

  recordProposalApprove(ref?: string): void {
    this.counters.proposalsApproved++;
    this.addLog('proposal_approve', `提案 ${ref} 已审批`, ref);
  }

  recordProposalReject(ref?: string): void {
    this.counters.proposalsRejected++;
    this.addLog('proposal_reject', `提案 ${ref} 已拒绝`, ref);
  }

  recordError(detail: string): void {
    this.counters.errors++;
    this.addLog('error', detail);
  }

  recordCoolingSkip(sentinelId: string, hoursSinceLastAdjust: number): void {
    this.counters.coolingPeriodSkips++;
    this.addLog('cooling_skip', `${sentinelId}: 距上次调整 ${hoursSinceLastAdjust.toFixed(1)}h`, sentinelId);
  }

  recordBoundProtection(sentinelId: string, attempted: number, clamped: number): void {
    this.counters.boundProtections++;
    this.addLog('bound_protect', `${sentinelId}: ${attempted}→${clamped}`, sentinelId);
  }

  // ═══ 查询 ═══

  /** 获取当前 metrics 快照 */
  getSnapshot(): MetricsSnapshot {
    return {
      counters: { ...this.counters },
      startedAt: this.startedAt,
      recentLogs: [...this.logRing],
    };
  }

  // ═══ 私有 ═══

  private addLog(type: OperationLogEntry['type'], detail: string, ref?: string): void {
    this.logRing.push({ timestamp: new Date().toISOString(), type, detail, ref });
    if (this.logRing.length > MAX_LOG_ENTRIES) {
      this.logRing.shift();
    }
  }
}
