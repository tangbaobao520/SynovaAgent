/**
 * agent/synova-agent.ts — SynovaAgent 运行时封装 (Batch 1 #16)
 *
 * 对标 Claude Code 的 Agent 生命周期:
 *   start() → 创建服务 + 调度器 + Sentinel 哨兵 → stop() → 优雅关闭
 *
 * 数据库通过构造函数注入 (铁律 32/39: L2 不管理 L5 生命周期)
 *
 * 用法:
 *   const db = new Database(config.dbPath);
 *   const agent = new SynovaAgent(db);
 *   await agent.start();
 */
import type { Server } from 'http';
import type Database from 'better-sqlite3';
import { createServer } from '../server';
import { CronScheduler, getGlobalScheduler, destroyGlobalScheduler } from '../cron/scheduler';
import { SentinelRunner } from '../sentinel';
import { loadConfig } from '../config';
import { createLogger } from '../logger';

const log = createLogger('agent/synova-agent');

export class SynovaAgent {
  private server: Server | null = null;
  private scheduler: CronScheduler | null = null;
  private sentinelRunner: SentinelRunner | null = null;
  private db: Database.Database;
  private cleanupHandlers: Array<() => void> = [];

  constructor(db: Database.Database) {
    this.db = db;
  }

  async start(): Promise<void> {
    const config = loadConfig();

    // HTTP 服务
    this.server = await createServer();

    // Cron 调度器 (全局单例, DI 注入数据库)
    this.scheduler = getGlobalScheduler(this.db);
    this.scheduler.schedule('ontology-monitor', '*/5 * * * *', async () => {
      try {
        const res = await fetch(`http://localhost:${config.port}/api/ontology/graph/default`);
        if (res.ok) log.info('[cron] ontology-monitor: OK');
      } catch (err: any) {
        log.warn({ err: err.message }, '[cron] ontology-monitor 执行失败');
      }
    });

    // SentinelRunner — 启动所有 cron 哨兵 (P1-4)
    this.sentinelRunner = new SentinelRunner(this.scheduler);
    this.sentinelRunner.start();

    log.info({ port: config.port }, 'SynovaAgent 已启动');

    // 资源清理
    const cleanup = () => {
      log.info('正在关闭...');
      if (this.sentinelRunner) { this.sentinelRunner.stop(); this.sentinelRunner = null; }
      destroyGlobalScheduler();
      this.scheduler = null;
      if (this.server) { this.server.close(); this.server = null; }
    };
    this.cleanupHandlers.push(cleanup);
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
  }

  async stop(): Promise<void> {
    for (const h of this.cleanupHandlers) h();
    this.cleanupHandlers = [];
    log.info('SynovaAgent 已停止');
  }

  getServer(): Server | null { return this.server; }
  getScheduler(): CronScheduler | null { return this.scheduler; }
}
