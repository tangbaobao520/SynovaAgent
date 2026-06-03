/**
 * agent/synova-agent.ts — SynovaAgent 运行时封装 (Batch 1 #16)
 *
 * 对标 Claude Code 的 Agent 生命周期:
 *   start() → 创建服务 + 调度器 + 资源 → stop() → 优雅关闭
 */
import type { Server } from 'http';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { createServer } from '../server';
import { getGlobalScheduler, destroyGlobalScheduler } from '../cron/scheduler';
import { loadConfig } from '../config';
import { createLogger } from '../logger';

const log = createLogger('agent/synova-agent');

export class SynovaAgent {
  private server: Server | null = null;
  private scheduler: CronScheduler | null = null;
  private db: Database.Database | null = null;
  private cleanupHandlers: Array<() => void> = [];

  async start(): Promise<void> {
    const config = loadConfig();

    // 数据库
    const dbDir = path.dirname(config.dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    this.db = new Database(config.dbPath);
    this.db.pragma('journal_mode = WAL');

    // HTTP 服务
    this.server = await createServer();

    // Cron 调度器 (Slice 2.3: 全局单例, H4 fix)
    this.scheduler = getGlobalScheduler(this.db);
    this.scheduler.schedule('ontology-monitor', '*/5 * * * *', async () => {
      try {
        const res = await fetch(`http://localhost:${config.port}/api/ontology/graph/default`);
        if (res.ok) log.info('[cron] ontology-monitor: OK');
      } catch (err: any) {
        log.warn({ err: err.message }, '[cron] ontology-monitor 执行失败');
      }
    });
    log.info({ port: config.port }, 'SynovaAgent 已启动');

    // 资源清理 (Slice 2.3: H4 fix — 全局单例)
    const cleanup = () => {
      log.info('正在关闭...');
      destroyGlobalScheduler();
      this.scheduler = null;
      if (this.server) { this.server.close(); this.server = null; }
      if (this.db) { this.db.close(); this.db = null; }
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
