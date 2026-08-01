/**
 * cron/scheduler.ts — Cron 调度器 + Hybrid 触发器 (D94)
 *
 * Yer 3.4 + D94: triggerType='cron'|'event'|'hybrid'
 * - cron: 传统定时触发（向后兼容）
 * - event: 仅事件触发（无定时）
 * - hybrid: cron 作为安全网 + event 作为加速器
 *
 * 对标 Hermes cron/scheduler.py: setTimeout 循环 + SQLite 持久化。
 * 简单可靠，不需要外部依赖。
 */
import type Database from 'better-sqlite3';
import { createLogger } from '@synova/logger';

const log = createLogger('cron/scheduler');

// ═══ Types ═══

export type TriggerType = 'cron' | 'event' | 'hybrid';

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
  // D94: Hybrid trigger support
  triggerType: TriggerType;
  eventTypes: string[];
  lastEventAt: string | null;
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

  const check = new Date(from.getTime() + 60000);
  check.setSeconds(0, 0);

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

  const fallback = new Date(from.getTime() + 3600000);
  fallback.setMinutes(0, 0, 0);
  return fallback;
}

// ═══ Event Bus (in-process) ═══

type EventListener = (eventType: string, payload?: unknown) => void;
const eventListeners = new Map<string, Set<EventListener>>();

/**
 * 注册事件监听器（进程内事件总线）。
 */
export function onEventType(eventType: string, listener: EventListener): void {
  if (!eventListeners.has(eventType)) eventListeners.set(eventType, new Set());
  eventListeners.get(eventType)!.add(listener);
}

/**
 * 触发事件（供外部模块调用）。
 */
export function emitEvent(eventType: string, payload?: unknown): void {
  const listeners = eventListeners.get(eventType);
  if (!listeners || listeners.size === 0) return;
  for (const listener of listeners) {
    try { listener(eventType, payload); } catch (err: unknown) {
      log.warn({ err, eventType }, '事件监听器执行失败 — 不阻断');
    }
  }
}

// ═══ CronScheduler ═══

export class CronScheduler {
  private db: Database.Database;
  private jobs = new Map<string, CronJob>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  // D94: 事件 → jobs 映射
  private eventToJobs = new Map<string, Set<string>>();

  constructor(db: Database.Database) {
    this.db = db;
    this.initSchema();
    this.restoreJobs();
    // D94: 事件订阅在 indexEventToJob/subscribeToEventType 时动态建立
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
        created_at TEXT DEFAULT (datetime('now')),
        trigger_type TEXT DEFAULT 'cron',
        event_types TEXT DEFAULT '[]',
        last_event_at TEXT
      );
    `);

    // D94: 迁移旧表 — 安全地添加列（忽略已存在错误）
    try { this.db.exec("ALTER TABLE cron_jobs ADD COLUMN trigger_type TEXT DEFAULT 'cron'"); } catch { log.warn({}, 'ALTER TABLE trigger_type 已存在或失败 — 跳过'); }
    try { this.db.exec("ALTER TABLE cron_jobs ADD COLUMN event_types TEXT DEFAULT '[]'"); } catch { log.warn({}, 'ALTER TABLE event_types 已存在或失败 — 跳过'); }
    try { this.db.exec("ALTER TABLE cron_jobs ADD COLUMN last_event_at TEXT"); } catch { log.warn({}, 'ALTER TABLE last_event_at 已存在或失败 — 跳过'); }
  }

  private restoreJobs(): void {
    const rows = this.db.prepare('SELECT * FROM cron_jobs').all() as Array<Record<string, unknown>>;
    for (const row of rows) {
      log.debug({ name: row.name, id: row.id }, '恢复持久化任务');
      const eventTypes: string[] = this.safeParseEventTypes(row.event_types as string | undefined);
      const job: CronJob = {
        id: row.id as string, name: row.name as string, cron: row.cron as string,
        handler: async () => {},
        lastRunAt: row.last_run_at as string | null, lastError: row.last_error as string | null,
        failures: Number(row.failures || 0), runs: Number(row.runs || 0),
        nextRun: nextCronTime(row.cron as string).getTime(),
        triggerType: (row.trigger_type as TriggerType) || 'cron',
        eventTypes,
        lastEventAt: row.last_event_at as string | null,
      };
      this.jobs.set(job.id, job);
      this.indexEventToJob(job);
    }
  }

  private safeParseEventTypes(raw: string | undefined): string[] {
    if (!raw) return [];
    try { return JSON.parse(raw); } catch {
      log.warn({ raw }, 'event_types JSON 解析失败 — 返回空数组');
      return [];
    }
  }

  // ═══ D94: Event → Job 索引 ═══

  private indexEventToJob(job: CronJob): void {
    for (const et of job.eventTypes) {
      if (!this.eventToJobs.has(et)) {
        this.eventToJobs.set(et, new Set());
        this.subscribeToEventType(et);
      }
      this.eventToJobs.get(et)!.add(job.id);
    }
  }

  private subscribeToEventType(eventType: string): void {
    onEventType(eventType, (et, payload) => {
      this.onEvent(et, payload).catch(err => {
        log.warn({ err, eventType: et }, "事件触发执行失败");
      });
    });
  }

  // ═══ Public API ═══

  /**
   * 调度一个任务。
   *
   * @param name - 任务名称
   * @param cron - cron 表达式
   * @param handler - 执行函数
   * @param triggerType - 触发器类型（默认 'cron'，向后兼容）
   * @param eventTypes - 监听的事件类型列表（event/hybrid 时使用）
   * @returns job ID
   */
  schedule(
    name: string,
    cron: string,
    handler: () => Promise<void>,
    triggerType: TriggerType = 'cron',
    eventTypes: string[] = [],
  ): string {
    const id = `cron_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`; // nosec: nonce
    const nextRun = nextCronTime(cron).getTime();

    const job: CronJob = {
      id, name, cron, handler, lastRunAt: null, lastError: null, failures: 0, runs: 0, nextRun,
      triggerType, eventTypes, lastEventAt: null,
    };
    this.jobs.set(id, job);
    this.indexEventToJob(job);

    this.db.prepare(
      'INSERT OR REPLACE INTO cron_jobs (id, name, cron, trigger_type, event_types) VALUES (?,?,?,?,?)',
    ).run(id, name, cron, triggerType, JSON.stringify(eventTypes));
    log.debug({ name, cron, triggerType, nextRun: new Date(nextRun).toISOString() }, '任务已调度');

    return id;
  }

  listJobs(): Array<{
    id: string; name: string; cron: string; triggerType: TriggerType;
    eventTypes: string[]; lastRunAt: string | null; lastError: string | null;
    failures: number; runs: number;
  }> {
    return [...this.jobs.values()].map(j => ({
      id: j.id, name: j.name, cron: j.cron, triggerType: j.triggerType,
      eventTypes: j.eventTypes,
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
    const job = this.jobs.get(id);
    if (job) {
      for (const et of job.eventTypes) {
        this.eventToJobs.get(et)?.delete(id);
      }
    }
    this.jobs.delete(id);
    this.db.prepare('DELETE FROM cron_jobs WHERE id=?').run(id);
    log.info({ id }, '任务已删除');
  }

  stop(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  // ═══ D94: Event Methods ═══

  /**
   * 注册事件触发器 — 将 job 与事件类型关联。
   * 事件触发时执行 job。
   */
  registerEventTrigger(jobId: string, eventType: string): void {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`任务不存在: ${jobId}`);

    if (!job.eventTypes.includes(eventType)) {
      job.eventTypes.push(eventType);
    }
    this.indexEventToJob(job);

    const etJson = JSON.stringify(job.eventTypes);
    this.db.prepare('UPDATE cron_jobs SET event_types=? WHERE id=?').run(etJson, jobId);
    log.info({ jobId, eventType }, '事件触发器已注册');
  }

  /**
   * 处理事件 — 触发所有匹配的 hybrid/event 类型 job。
   *
   * event 类型: 直接执行
   * hybrid 类型: 执行 + 重置 cron 计时器
   *
   * @returns 被触发的 job ID 列表
   */
  async onEvent(eventType: string, _payload?: unknown): Promise<string[]> {
    const matchingJobIds = this.eventToJobs.get(eventType);
    if (!matchingJobIds || matchingJobIds.size === 0) return [];

    const fired: string[] = [];
    for (const jobId of matchingJobIds) {
      const job = this.jobs.get(jobId);
      if (!job) continue;
      if (job.triggerType === 'cron') continue; // cron-only 不受事件影响

      try {
        await this.runJob(job);
        job.lastEventAt = new Date().toISOString();
        fired.push(jobId);

        // hybrid: 事件触发后重置 cron 计时器（延长安全网）
        if (job.triggerType === 'hybrid') {
          job.nextRun = nextCronTime(job.cron).getTime();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn({ err: msg, jobId, eventType }, '事件触发执行失败 — 降级');
      }
    }
    return fired;
  }

  /**
   * 重置事件计时器 — hybrid 模式下事件触发后调用。
   * 将 cron 计时器重置为从现在起的下一个 cron 时间。
   */
  resetEventTimer(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`任务不存在: ${jobId}`);
    if (job.triggerType !== 'hybrid') return; // 仅 hybrid 模式需要
    job.nextRun = nextCronTime(job.cron).getTime();
    job.lastEventAt = new Date().toISOString();
    log.debug({ jobId, nextRun: new Date(job.nextRun).toISOString() }, 'Hybrid 计时器已重置');
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
      // cron-only 和 hybrid: cron 定时触发
      // event-only: 不参与 cron 轮询
      if (job.triggerType === 'event') continue;

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
      log.debug({ name: job.name }, '任务开始');
      await job.handler();
      job.lastRunAt = new Date().toISOString();
      job.lastError = null;
      job.runs++;
      job.failures = 0;
      job.nextRun = nextCronTime(job.cron).getTime();
      const dur = Date.now() - start;
      log.debug({ name: job.name, durationMs: dur }, '任务完成');
      this.persistRun(job);
    } catch (err: unknown) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, "任务调试信息记录");
      const msg = err instanceof Error ? err.message : String(err);
      job.lastError = msg;
      job.failures++;
      job.nextRun = Date.now() + 60000;
      log.error({ err: msg, name: job.name, failures: job.failures }, '任务失败');
      this.persistRun(job);
    }
  }

  private persistRun(job: CronJob): void {
    this.db.prepare(
      'UPDATE cron_jobs SET last_run_at=?, last_error=?, failures=?, runs=?, last_event_at=? WHERE id=?',
    ).run(job.lastRunAt, job.lastError, job.failures, job.runs, job.lastEventAt, job.id);
  }
}

// ═══ Global Singleton ═══

let _globalScheduler: CronScheduler | null = null;
let _initLock: Promise<CronScheduler> | null = null;

export function getGlobalScheduler(db?: import('better-sqlite3').Database): CronScheduler {
  if (_globalScheduler) return _globalScheduler;
  if (!db) throw new Error('首次调用 getGlobalScheduler 必须提供 database 实例');

  if (!_initLock) {
    _initLock = (async () => {
      _globalScheduler = new CronScheduler(db!);
      return _globalScheduler;
    })();
  }

  if (_globalScheduler) return _globalScheduler;
  throw new Error('CronScheduler 初始化未完成');
}

export function destroyGlobalScheduler(): void {
  if (_globalScheduler) {
    _globalScheduler.stop();
    _globalScheduler = null;
  }
}
