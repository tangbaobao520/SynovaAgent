/**
 * cron.test.ts — Cron 调度器测试 (Era 3.4, iron law 0-2 Step 2)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CronScheduler } from '../src/cron/scheduler';
import Database from 'better-sqlite3';

let db: Database.Database;
let scheduler: CronScheduler;

beforeEach(() => {
  db = new Database(':memory:');
  scheduler = new CronScheduler(db);
});

afterEach(() => {
  scheduler.stop();
  db.close();
});

describe('CronScheduler', () => {
  it('Given scheduler, When schedule, Then returns job id', () => {
    const id = scheduler.schedule('test-job', '0 9 * * 1', async () => {});
    expect(id).toBeTruthy();
    expect(id).toMatch(/^cron_/);
  });

  it('Given scheduled job, When listed, Then appears in list', () => {
    scheduler.schedule('test-job', '0 9 * * 1', async () => {});
    const jobs = scheduler.listJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].name).toBe('test-job');
    expect(jobs[0].cron).toBe('0 9 * * 1');
  });

  it('Given job, When executed manually, Then handler is called', async () => {
    let called = false;
    scheduler.schedule('manual-job', '* * * * *', async () => { called = true; });
    await scheduler.executeNow('manual-job');
    expect(called).toBe(true);
  });

  it('Given job that throws, When executed, Then records failure without crashing', async () => {
    scheduler.schedule('crashy', '* * * * *', async () => { throw new Error('BOOM'); });
    await scheduler.executeNow('crashy');
    const job = scheduler.listJobs().find(j => j.name === 'crashy');
    expect(job!.lastError).toContain('BOOM');
    expect(job!.failures).toBe(1);
  });

  it('Given multiple jobs, When listed, Then all appear', () => {
    scheduler.schedule('a', '0 9 * * 1', async () => {});
    scheduler.schedule('b', '0 12 * * *', async () => {});
    expect(scheduler.listJobs()).toHaveLength(2);
  });

  it('Given job, When removed, Then not in list', () => {
    const id = scheduler.schedule('temp', '0 9 * * 1', async () => {});
    scheduler.remove(id);
    expect(scheduler.listJobs()).toHaveLength(0);
  });

  it('Given persisted jobs, When new scheduler created, Then restores jobs', () => {
    scheduler.schedule('persistent', '0 9 * * 1', async () => {});
    // Create new scheduler with same DB
    const s2 = new CronScheduler(db);
    const jobs = s2.listJobs();
    expect(jobs.length).toBeGreaterThanOrEqual(1);
    expect(jobs.some(j => j.name === 'persistent')).toBe(true);
    s2.stop();
  });
});
