/**
 * sentinel/runner.ts — SentinelRunner 调度框架 (P1-4)
 *
 * 桥接 Sentinel 接口与 CronScheduler:
 *   1. 从 SentinelRegistry 读取所有 cron-mode 哨兵
 *   2. 为每个哨兵注册 Cron 任务
 *   3. 执行 check() → 收集发现 → 记录日志
 *   4. 单个哨兵失败不影响其他 (degraded 传播)
 *
 * @state: real — 生产可用, 与现有 CronScheduler 集成
 */

import type { CronScheduler } from '../cron/scheduler';
import type { Sentinel, SentinelCheckResult } from './types';
import { getSentinelRegistry } from './registry';
import { getBaselineStore } from './baseline-store';
import { createLogger } from '../logger';

const log = createLogger('sentinel/runner');

// ═══ Types ═══

export interface SentinelRunRecord {
  sentinelId: string;
  sentinelName: string;
  result: SentinelCheckResult;
  /** Cron job ID (from scheduler) */
  cronJobId: string;
}

export interface SentinelRunnerStats {
  totalSentinels: number;
  totalRuns: number;
  totalFindings: number;
  criticalFindings: number;
  warningFindings: number;
  lastRunAt: string | null;
}

// ═══ SentinelRunner ═══

export class SentinelRunner {
  private scheduler: CronScheduler;
  private db: unknown;
  private records = new Map<string, SentinelRunRecord[]>();
  private cronJobIds = new Map<string, string>();
  private totalRuns = 0;

  constructor(scheduler: CronScheduler, db: unknown) {
    this.scheduler = scheduler;
    this.db = db;
  }

  /**
   * 启动所有 cron-mode 哨兵。
   * 从 SentinelRegistry 读取, 为每个 cron 哨兵注册定时任务。
   */
  start(): void {
    const registry = getSentinelRegistry();
    const cronSentinels = registry.listCronSentinels();

    if (cronSentinels.length === 0) {
      log.info('[runner] 无 cron-mode 哨兵 — 跳过启动');
      return;
    }

    for (const { sentinel, cron } of cronSentinels) {
      this.scheduleSentinel(sentinel, cron);
    }

    // 信号聚合 — 每小时整点过 5 分运行 (在所有哨兵之后)
    this.scheduler.schedule('SignalAggregator', '5 * * * *', async () => {
      await this.aggregateAndDispatch();
    });

    log.info({ count: cronSentinels.length }, '[runner] 所有 cron 哨兵 + 信号聚合已启动');
  }

  /**
   * 停止所有哨兵。
   */
  stop(): void {
    for (const [sentinelId, cronJobId] of this.cronJobIds) {
      try {
        this.scheduler.remove(cronJobId);
      } catch { log.warn({ sentinelId }, '[runner] cron 取消失败 (可能已停止)'); }
    }
    this.cronJobIds.clear();
    log.info('[runner] 所有哨兵已停止');
  }

  /**
   * 手动运行指定哨兵 (不等待 cron)。
   */
  async runOnce(sentinelId: string): Promise<SentinelCheckResult | null> {
    const registry = getSentinelRegistry();
    const sentinel = registry.get(sentinelId);
    if (!sentinel) {
      log.warn({ sentinelId }, '[runner] 哨兵未找到');
      return null;
    }
    return this.executeSentinel(sentinel);
  }

  /** 获取运行统计 */
  getStats(): SentinelRunnerStats {
    const allFindings = [...this.records.values()].flatMap(rs => rs.flatMap(r => r.result.findings));
    const lastRecord = [...this.records.values()].flatMap(rs => rs).sort((a, b) =>
      b.result.checkedAt.localeCompare(a.result.checkedAt)
    )[0];

    return {
      totalSentinels: this.cronJobIds.size,
      totalRuns: this.totalRuns,
      totalFindings: allFindings.length,
      criticalFindings: allFindings.filter(f => f.severity === 'critical').length,
      warningFindings: allFindings.filter(f => f.severity === 'warning').length,
      lastRunAt: lastRecord?.result.checkedAt ?? null,
    };
  }

  /**
   * 信号聚合 — 收集所有哨兵最新结果，交叉关联，输出聚合信号。
   * 每小时调用一次 (在所有哨兵 cron tick 之后)。
   */
  async aggregateAndDispatch(): Promise<void> {
    try {
      const results: SentinelCheckResult[] = [];
      for (const [, history] of this.records) {
        if (history.length > 0) {
          results.push(history[history.length - 1].result);
        }
      }
      if (results.length === 0) return;

      const { aggregateSignals } = await import('./signal-aggregator');
      const { signals, stats } = aggregateSignals(results);

      if (stats.criticalSignals > 0) {
        log.warn({
          totalFindings: stats.totalFindings,
          aggregatedSignals: stats.aggregatedSignals,
          criticalSignals: stats.criticalSignals,
          signals: signals.slice(0, 3).map(s => ({ id: s.id, severity: s.severity, experts: s.recommendedExperts })),
        }, '[runner] 聚合信号 — 发现 critical 信号');
      } else if (signals.length > 0) {
        log.info({ signals: signals.length, critical: 0 }, '[runner] 聚合完成 — 无 critical 信号');
      }
    } catch (err: unknown) {
      log.error({ err }, '[runner] 信号聚合失败');
    }
  }

  /** 获取最近哨兵运行记录 (供外部 API 查询) */
  getRecentResults(): Map<string, SentinelRunRecord[]> {
    return this.records;
  }

  // ═══ Private ═══

  private scheduleSentinel(sentinel: Sentinel, cron: string): void {
    const cronJobId = this.scheduler.schedule(
      `Sentinel: ${sentinel.config.name}`,
      cron,
      async () => {
        await this.executeSentinel(sentinel);
      },
    );
    this.cronJobIds.set(sentinel.config.id, cronJobId);

    log.info({ sentinelId: sentinel.config.id, cron }, '[runner] 哨兵已调度');
  }

  private async executeSentinel(sentinel: Sentinel): Promise<SentinelCheckResult> {
    const startTime = Date.now();
    try {
      // 构造上下文 — 哨兵通过 context.db 访问数据库
      const ctx = {
        db: this.db,
        now: new Date(),
        registry: getSentinelRegistry(),
      };

      const result = await sentinel.check(ctx);
      const duration = Date.now() - startTime;
      result.durationMs = duration;

      // 记录运行
      const record: SentinelRunRecord = {
        sentinelId: sentinel.config.id,
        sentinelName: sentinel.config.name,
        result,
        cronJobId: this.cronJobIds.get(sentinel.config.id) || '',
      };

      const history = this.records.get(sentinel.config.id) || [];
      history.push(record);
      // 只保留最近 50 条记录
      if (history.length > 50) history.shift();
      this.records.set(sentinel.config.id, history);
      this.totalRuns++;

      // 记录发现
      // 基线记录 + 对比 (B2)
      try {
        const baselineStore = getBaselineStore();
        baselineStore.record(sentinel.config.id, result.findings);
        const comparison = baselineStore.compare(sentinel.config.id, result.findings);
        if (comparison.deviation.findingCountRatio > 2 && comparison.baseline.baselineReady) {
          log.warn({
            sentinelId: sentinel.config.id,
            ratio: comparison.deviation.findingCountRatio.toFixed(1),
            baseline: comparison.baseline.avgFindingCount.toFixed(1),
            current: comparison.current.findingCount,
          }, '[runner] 基线偏离 — finding 数量异常');
        }
      } catch (baselineErr: any) {
        log.debug({ err: baselineErr.message }, '[runner] 基线记录失败 (非阻断)');
      }

      if (result.findings.length > 0) {
        const critical = result.findings.filter(f => f.severity === 'critical').length;
        const warning = result.findings.filter(f => f.severity === 'warning').length;
        log.warn({
          sentinelId: sentinel.config.id,
          total: result.findings.length,
          critical,
          warning,
          durationMs: duration,
        }, `[runner] 哨兵发现: ${result.findings.length} 条 (${critical} critical, ${warning} warning)`);
      }

      if (!result.ok) {
        log.error({
          sentinelId: sentinel.config.id,
          error: result.error,
          durationMs: duration,
        }, '[runner] 哨兵执行失败');
      }

      return result;
    } catch (err) {
      const duration = Date.now() - startTime;
      log.error({ sentinelId: sentinel.config.id, err, durationMs: duration }, '[runner] 哨兵异常 (未捕获)');

      return {
        sentinelId: sentinel.config.id,
        ok: false,
        findings: [],
        durationMs: duration,
        checkedAt: new Date().toISOString(),
        error: (err as Error).message || '未知错误',
        degraded: true,
      };
    }
  }
}
