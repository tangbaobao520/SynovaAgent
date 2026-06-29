/**
 * services/context-budget-tracker.ts — 上下文预算追踪器 (Era C2)
 *
 * 跟踪每次 LLM 调用的 token 消耗, 提供预算感知能力。
 * 对标: OpenClaw context-budget.ts
 *
 * 铁律 39: L5 存储层 — 数据持久化 + 统计计算。
 */

import { createLogger } from '@synova/logger';

const log = createLogger('services/context-budget');

// ═══ Types ═══

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** 缓存命中的 prompt tokens (OpenAI-compatible) */
  cachedPromptTokens?: number;
}

export interface BudgetSnapshot {
  /** 当前累计 token 消耗 */
  totalSpent: number;
  /** 调用次数 */
  callCount: number;
  /** 缓存命中率 (0-1) */
  cacheHitRate: number;
  /** 按模型分组的消耗 */
  byModel: Record<string, { spent: number; calls: number }>;
  /** 时间窗口内的消耗速率 (tokens/min) */
  burnRate: number;
}

// ═══ Internal Types ═══

interface UsageRecord {
  timestamp: number;   // Date.now()
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedPromptTokens?: number;
  model: string;
}

// ═══ ContextBudgetTracker ═══

export class ContextBudgetTracker {
  private records: UsageRecord[] = [];
  /** 默认模型名 (当 record() 未传入 model 时使用) */
  private defaultModel: string;

  constructor(defaultModel = 'unknown') {
    this.defaultModel = defaultModel;
    log.info('ContextBudgetTracker 已初始化');
  }

  /**
   * 记录一次 LLM 调用的 token 消耗。
   * provider.chat() / provider.stream() 返回的 usage 字段传入此处。
   */
  record(usage: TokenUsage, model?: string): void {
    const record: UsageRecord = {
      timestamp: Date.now(),
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      cachedPromptTokens: usage.cachedPromptTokens,
      model: model || this.defaultModel,
    };
    this.records.push(record);
    log.debug({ total: usage.totalTokens, model: record.model }, 'token usage recorded');
  }

  /**
   * 返回当前预算快照。
   * 典型用法: GET /api/status/budget 路由调用。
   */
  snapshot(): BudgetSnapshot {
    if (this.records.length === 0) {
      return {
        totalSpent: 0,
        callCount: 0,
        cacheHitRate: 0,
        byModel: {},
        burnRate: 0,
      };
    }

    const byModel: Record<string, { spent: number; calls: number }> = {};
    let totalSpent = 0;
    let totalCacheHits = 0;
    let totalCached = 0;
    const now = Date.now();

    for (const r of this.records) {
      totalSpent += r.totalTokens;
      const m = r.model;
      if (!byModel[m]) byModel[m] = { spent: 0, calls: 0 };
      byModel[m].spent += r.totalTokens;
      byModel[m].calls += 1;
      if (r.cachedPromptTokens) {
        totalCacheHits += r.cachedPromptTokens;
        totalCached += 1;
      }
    }

    // 缓存命中率 = 缓存命中的 prompt tokens / 所有 prompt tokens
    const totalPromptTokens = this.records.reduce((s, r) => s + r.promptTokens, 0);
    const cacheHitRate = totalPromptTokens > 0 ? totalCacheHits / totalPromptTokens : 0;

    // 消耗速率: 最近 5 分钟的 tokens / 分钟
    const fiveMinAgo = now - 5 * 60 * 1000;
    const recentRecords = this.records.filter(r => r.timestamp >= fiveMinAgo);
    const recentTokens = recentRecords.reduce((s, r) => s + r.totalTokens, 0);
    const windowMinutes = 5;
    const burnRate = recentTokens / windowMinutes;

    return {
      totalSpent,
      callCount: this.records.length,
      cacheHitRate,
      byModel,
      burnRate,
    };
  }

  /**
   * 检查是否会超出预算。
   * @param limit — 预算上限 (tokens)
   * @param estimatedNextCall — 预估下次调用消耗
   * @returns true 如果超出
   */
  wouldExceed(limit: number, estimatedNextCall: number): boolean {
    if (limit <= 0) return false;
    const snap = this.snapshot();
    return snap.totalSpent + estimatedNextCall > limit;
  }

  /** 重置追踪器 (用于测试) */
  reset(): void {
    this.records = [];
    log.debug('ContextBudgetTracker 已重置');
  }
}

// ═══ Singleton ═══

let _instance: ContextBudgetTracker | null = null;

/** 获取全局单例 */
export function getBudgetTracker(): ContextBudgetTracker {
  if (!_instance) {
    _instance = new ContextBudgetTracker();
  }
  return _instance;
}
