/**
 * tests/agent/scheduler-service.test.ts — L2 cron 调度器访问服务（D603 簇6）配对测试
 *
 * 契约（铁律 47）—— src/agent/scheduler-service.ts（纯转发 re-export）：
 *   @input  getGlobalScheduler(db?) — 首次必须提供 db（cron/scheduler 语义原样传播）
 *   @output CronScheduler（schedule/stop 表面）
 *   @degraded 未提供 db 且单例未初始化 → 抛出（TUI /quit 前的调度器获取失败即此路径）
 *
 * 覆盖矩阵（铁律 48）：[回归] 转发同一函数（L1→L2 桥不换语义）/ [降级] 无 db 首调抛错 /
 * [正常] 内存 db 获取调度器表面可用
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { getGlobalScheduler } from '../../src/agent/scheduler-service';
import { getGlobalScheduler as getGlobalSchedulerDirect } from '../../src/cron/scheduler';

describe('scheduler-service — 纯转发桥', () => {
  it('[回归] 与源模块导出同一函数（转发不换语义）', () => {
    expect(getGlobalScheduler).toBe(getGlobalSchedulerDirect);
  });

  it('[降级] 首次调用未提供 db → 抛错（源语义原样传播）', () => {
    // 注意：若同 worker 内其它用例已初始化全局单例，此用例需先跑——本文件按序执行，
    // 本用例位于正常路径用例之前；跨文件由 vitest worker 隔离保证。
    expect(() => (getGlobalScheduler as () => unknown)()).toThrow();
  });

  it('[正常] 内存 db 获取调度器：schedule/stop 表面可用（TUI ontology-monitor 依赖面）', () => {
    const db = new Database(':memory:');
    try {
      const scheduler = getGlobalScheduler(db);
      expect(typeof scheduler.schedule).toBe('function');
      expect(typeof scheduler.stop).toBe('function');
    } finally {
      db.close();
    }
  });
});
