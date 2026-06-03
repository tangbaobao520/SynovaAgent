/**
 * cron/scheduler.ts — Cron 调度器 (Era 3.4)
 *
 * 对标 Hermes cron/scheduler.py: setTimeout 循环 + SQLite 持久化。
 * 简单可靠，不需要外部依赖。
 *
 * cron 表达式: 分 时 日 月 周 (标准 5 字段)
 * 支持: * 通配符, 具体数字, 列表 (逗号分隔)
 */
import type Database from 'better-sqlite3';
import { createLogger } from '../logger';

const log = createLogger('cron/scheduler');

// ═══ Types ═══

export interface CronJob {
  id: string;
  name: string;
  cron: string;
  handler: () => Promise<void>;
  lastRunAt: string | null;
  lastError: string | null;
  failures: number;
  runs: number;
  nextRun: number; // timestamp
}

// ═══ Cron Expression Parser ═══

function parseCronField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();
  if (field === '*') {
    for (let i = min; i <= max; i++) values.add(i);
  } else {
    for (const part of field.split(',')) {
      const n = parseInt(part.trim());
      if (!isNaN(n) && n >= min && n <= max) values.add(n);
    }
  }
  return values;
}

function nextCronTime(cron: string, from: Date = new Date()): Date {
  const [minF, hourF, dayF, monthF, dowF] = cron.split(/\s+/);
  const mins = parseCronField(minF, 0, 59);
  const hours = parseCronField(hourF, 0, 23);
  const days = parseCronField(dayF, 1, 31);
  const months = parseCronField(monthF, 1, 12);
  const dows = parseCronField(dowF, 0, 6);

  const check = new Date(from.getTime() + 60000); // start from next minute
  check.setSeconds(0, 0);

  // Try up to 2 years ahead
  const limit = new Date(from);
  limit.setFullYear(limit.getFullYear() + 2);

  while (check <= limit) {
    if (
      months.has(check.getMonth() + 1) &&
      days.has(check.getDate()) &&
      hours.has(check.getHours()) &&
      mins.has(check.getMinutes()) &&
      dows.has(check.getDay())
    ) {
      return check;
    }
    check.setMinutes(check.getMinutes() + 1);
  }

  // Fallback: next hour
  const fallback = new Date(from.getTime() + 3600000);
  fallback.setMinutes(0, 0, 0);
  return fallback;
}

// ═══ CronScheduler ═══

export class CronScheduler {
  private db: Database.Database;
  private jobs = new Map<string, CronJob>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(db: Database.Database) {
    this.db = db;
    this.initSchema();
    this.restoreJobs();
    this.start();
  }

  // ═══ Schema ═══

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cron_jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        cron TEXT NOT NULL,
        last_run_at TEXT,
        last_error TEXT,
        failures INTEGER DEFAULT 0,
        runs INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  private restoreJobs(): void {
    const rows = this.db.prepare('SELECT * FROM cron_jobs').all() as any[];
    for (const row of rows) {
      log.debug({ name: row.name, id: row.id }, '恢复持久化任务');
      // 恢复为无操作 job — 调用方在启动时重新 schedule 同名任务覆盖
      const job: CronJob = {
        id: row.id, name: row.name, cron: row.cron,
        handler: async () => {}, // 占位，等待重新注册
        lastRunAt: row.last_run_at, lastError: row.last_error,
        failures: row.failures || 0, runs: row.runs || 0,
        nextRun: nextCronTime(row.cron).getTime(),
      };
      this.jobs.set(job.id, job);
    }
  }

  // ═══ Public API ═══

  schedule(name: string, cron: string, handler: () => Promise<void>): string {
    const id = `cron_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`; // nosec: nonce
    const nextRun = nextCronTime(cron).getTime();

    const job: CronJob = { id, name, cron, handler, lastRunAt: null, lastError: null, failures: 0, runs: 0, nextRun };
    this.jobs.set(id, job);

    this.db.prepare('INSERT OR REPLACE INTO cron_jobs (id, name, cron) VALUES (?,?,?)').run(id, name, cron);
    log.debug({ name, cron, nextRun: new Date(nextRun).toISOString() }, '任务已调度');

    return id;
  }

  listJobs(): Array<{ id: string; name: string; cron: string; lastRunAt: string | null; lastError: string | null; failures: number; runs: number }> {
    return [...this.jobs.values()].map(j => ({
      id: j.id, name: j.name, cron: j.cron,
      lastRunAt: j.lastRunAt, lastError: j.lastError,
      failures: j.failures, runs: j.runs,
    }));
  }

  async executeNow(name: string): Promise<void> {
    const job = [...this.jobs.values()].find(j => j.name === name);
    if (!job) throw new Error(`任务不存在: ${name}`);
    await this.runJob(job);
  }

  remove(id: string): void {
    this.jobs.delete(id);
    this.db.prepare('DELETE FROM cron_jobs WHERE id=?').run(id);
    log.info({ id }, '任务已删除');
  }

  stop(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  // ═══ Internal ═══

  private start(): void {
    this.scheduleNextTick();
  }

  private scheduleNextTick(): void {
    if (this.jobs.size === 0) {
      this.timer = setTimeout(() => this.scheduleNextTick(), 60000);
      return;
    }

    const now = Date.now();
    let minNext = Infinity;

    for (const job of this.jobs.values()) {
      if (job.nextRun <= now) {
        this.runJob(job).catch(err => log.error({ err, name: job.name }, 'Cron 执行异常'));
      }
      if (job.nextRun < minNext) minNext = job.nextRun;
    }

    const delay = Math.max(1000, Math.min(minNext - Date.now(), 3600000));
    this.timer = setTimeout(() => this.scheduleNextTick(), delay);
  }

  private async runJob(job: CronJob): Promise<void> {
    const start = Date.now();
    try {
      log.debug({ name: job.name }, 'Cron 任务开始');
      await job.handler();
      job.lastRunAt = new Date().toISOString();
      job.lastError = null;
      job.runs++;
      job.failures = 0;
      job.nextRun = nextCronTime(job.cron).getTime();
      const dur = Date.now() - start;
      log.debug({ name: job.name, durationMs: dur }, 'Cron 任务完成');
      this.persistRun(job);
    } catch (err: any) {
      job.lastError = err.message;
      job.failures++;
      job.nextRun = Date.now() + 60000; // 失败后 1 分钟重试
      log.error({ err, name: job.name, failures: job.failures }, 'Cron 任务失败');
      this.persistRun(job);
    }
  }

  private persistRun(job: CronJob): void {
    this.db.prepare('UPDATE cron_jobs SET last_run_at=?, last_error=?, failures=?, runs=? WHERE id=?')
      .run(job.lastRunAt, job.lastError, job.failures, job.runs, job.id);
  }
}

// ═══ Global Singleton (Slice 2.3: H4 fix — 防止双重 CronScheduler 实例) ═══

let _globalScheduler: CronScheduler | null = null;

/** 获取或创建全局 CronScheduler 单例 */
export function getGlobalScheduler(db?: import('better-sqlite3').default): CronScheduler {
  if (!_globalScheduler) {
    if (!db) throw new Error('首次调用 getGlobalScheduler 必须提供 database 实例');
    _globalScheduler = new CronScheduler(db);
  }
  return _globalScheduler;
}

/** 停止并销毁全局单例（用于 graceful shutdown） */
export function destroyGlobalScheduler(): void {
  if (_globalScheduler) {
    _globalScheduler.stop();
    _globalScheduler = null;
  }
}
