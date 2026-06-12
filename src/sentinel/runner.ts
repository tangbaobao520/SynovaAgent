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
  private records = new Map<string, SentinelRunRecord[]>();
  private cronJobIds = new Map<string, string>();
  private totalRuns = 0;

  constructor(scheduler: CronScheduler) {
    this.scheduler = scheduler;
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

    log.info({ count: cronSentinels.length }, '[runner] 所有 cron 哨兵已启动');
  }

  /**
   * 停止所有哨兵。
   */
  stop(): void {
    for (const [sentinelId, cronJobId] of this.cronJobIds) {
      try {
        this.scheduler.remove(cronJobId);
      } catch {
        log.debug({ sentinelId }, '[runner] 取消 cron 任务失败 (可能已停止)');
      }
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
        db: (this.scheduler as any).db,
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
