/**
 * tests/cron/scheduler.test.ts — D94 CronScheduler Hybrid 测试
 *
 * 覆盖: cron-only/event/hybrid/degrade = 8 tests
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { CronScheduler, onEventType, emitEvent } from '../../src/cron/scheduler';

describe('CronScheduler', () => {
  let db: Database.Database;
  let scheduler: CronScheduler;
  let executionLog: string[];

  beforeEach(() => {
    db = new Database(':memory:');
    scheduler = new CronScheduler(db);
    executionLog = [];
  });

  afterEach(() => {
    scheduler.stop();
    db.close();
  });

  describe('cron-only（向后兼容）', () => {
    it('schedule 不传 triggerType → 默认为 cron', () => {
      const id = scheduler.schedule('test-cron', '0 0 * * *', async () => { executionLog.push('cron'); });
      const jobs = scheduler.listJobs();
      const job = jobs.find(j => j.id === id);
      expect(job?.triggerType).toBe('cron');
    });

    it('cron-only 不受事件影响', async () => {
      scheduler.schedule('cron-only', '0 0 * * *', async () => { executionLog.push('cron'); }, 'cron');
      const fired = await scheduler.onEvent('any-event');
      expect(fired.length).toBe(0);
      expect(executionLog.length).toBe(0);
    });

    it('listJobs 包含 triggerType/eventTypes', () => {
      scheduler.schedule('test', '* * * * *', async () => {}, 'cron');
      const jobs = scheduler.listJobs();
      expect(jobs[0]).toHaveProperty('triggerType');
      expect(jobs[0]).toHaveProperty('eventTypes');
    });
  });

  describe('event trigger', () => {
    it('event 类型 → onEvent 触发执行', async () => {
      scheduler.schedule('evt-job', '0 0 * * *', async () => { executionLog.push('event'); }, 'event', ['my-event']);
      const fired = await scheduler.onEvent('my-event');
      expect(fired.length).toBe(1);
      expect(executionLog).toContain('event');
    });

    it('未注册事件 → 不触发', async () => {
      scheduler.schedule('evt-job', '0 0 * * *', async () => { executionLog.push('event'); }, 'event', ['my-event']);
      const fired = await scheduler.onEvent('other-event');
      expect(fired.length).toBe(0);
    });
  });

  describe('hybrid trigger', () => {
    it('hybrid → 事件触发 + 执行', async () => {
      scheduler.schedule('hyb-job', '0 0 1 * *', async () => { executionLog.push('hybrid'); }, 'hybrid', ['alert']);
      const fired = await scheduler.onEvent('alert');
      expect(fired.length).toBe(1);
      expect(executionLog).toContain('hybrid');
    });
  });

  describe('registerEventTrigger', () => {
    it('运行时注册事件 → 可触发', async () => {
      const id = scheduler.schedule('dyn-job', '0 0 * * *', async () => { executionLog.push('dyn'); }, 'event', []);
      scheduler.registerEventTrigger(id, 'dynamic-event');
      const fired = await scheduler.onEvent('dynamic-event');
      expect(fired.length).toBe(1);
    });
  });

  describe('emitEvent 全局函数', () => {
    it('emitEvent → 触发 cron scheduler', async () => {
      scheduler.schedule('emit-test', '0 0 * * *', async () => { executionLog.push('emit'); }, 'event', ['external']);
      emitEvent('external');
      // 异步执行，给一点时间
      await new Promise(r => setTimeout(r, 50));
      expect(executionLog).toContain('emit');
    });
  });
});
