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
import { SentinelRunner, setGlobalSentinelRunner } from '../sentinel';
import { loadConfig } from '../config';
import { createLogger } from '@synova/logger';
// Phase 1: 启动恢复 + 优雅关闭
import { RestartRecovery } from '../services/restart-recovery';
import { GracefulShutdown, setGlobalGracefulShutdown } from '../services/graceful-shutdown';
import { ProactivePush } from './proactive-push';
import { ActionStore } from '../growth/action-store';

const log = createLogger('agent/synova-agent');

export class SynovaAgent {
  private server: Server | null = null;
  private scheduler: CronScheduler | null = null;
  private sentinelRunner: SentinelRunner | null = null;
  private db: Database.Database;
  private gracefulShutdown: GracefulShutdown;
  private cleanupHandlers: Array<() => void> = [];

  constructor(db: Database.Database) {
    this.db = db;
    this.gracefulShutdown = new GracefulShutdown();
    setGlobalGracefulShutdown(this.gracefulShutdown);
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

    // 基线存储 — SQLite 持久化 + 可配置阈值 (Week 2 Day 1-2)
    const { getBaselineStore } = await import('../sentinel/baseline-store');
    const baselineStore = getBaselineStore();
    baselineStore.setDatabase(this.db);
    // 从 synova.json 加载哨兵阈值配置
    if (config.sentinel) {
      baselineStore.updateConfig(config.sentinel);
      log.info({ baselineMinRuns: config.sentinel.baselineMinRuns }, '[baseline] 哨兵阈值配置已加载');
    }

    // 注册内置哨兵 (必须在 SentinelRunner 启动前——否则 Runner 找不到哨兵)
    const { registerBuiltinSentinels } = await import('../sentinel/builtins');
    await registerBuiltinSentinels();

    // Phase 1.1: 崩溃后恢复未完成会话
    try {
      const { SessionStore } = await import('../store/session-store');
      const sessionStore = new SessionStore(this.db);
      const recovery = new RestartRecovery(sessionStore);
      await recovery.recoverInterruptedSessions();
    } catch (err: unknown) {
      log.warn({ err }, '启动恢复失败 — degraded, 继续启动');
    }

    // SentinelRunner — 启动所有 cron 哨兵 (P1-4)
    this.sentinelRunner = new SentinelRunner(this.scheduler, this.db);
    setGlobalSentinelRunner(this.sentinelRunner);
    this.sentinelRunner.start();

    // D21-FIX: 创建 ProactivePush 实例 + 注入 ActionStore + 接线到 SentinelRunner
    const proactivePush = new ProactivePush([]);  // 空通道 — 推送后续接线
    proactivePush.setActionStore(new ActionStore());
    this.sentinelRunner.setProactivePush(proactivePush);

    // Phase 2.1: 启动时排干未投递消息
    try {
      const { DeliveryQueueStore } = await import('../l4/delivery-queue-store');
      const { DeliveryQueue } = await import('../l4/delivery-queue');
      const store = new DeliveryQueueStore(this.db);
      const queue = new DeliveryQueue(store);
      await queue.drain();
    } catch (err: unknown) {
      log.warn({ err }, '投递队列排干失败 — degraded, 继续启动');
    }

    // Phase 2.2: 卡住会话检测 (每分钟)
    this.scheduler.schedule('stuck-session-detector', '* * * * *', async () => {
      try {
        const { SessionStore } = await import('../store/session-store');
        const { getAgentMemoryStore } = await import('../l4/agent-memory-store');
        const { StuckSessionDetector } = await import('../services/stuck-session-detector');
        const sessionStore = new SessionStore(this.db);
        const memoryStore = getAgentMemoryStore(this.db);
        const detector = new StuckSessionDetector(sessionStore, memoryStore);
        await detector.detect();
      } catch (err: unknown) {
        log.warn({ err }, '[cron] stuck-session-detector 执行失败 — degraded');
      }
    });
    log.info('[cron] stuck-session-detector 已注册 (每 60 秒)');

    log.info({ port: config.port }, 'SynovaAgent 已启动');

    // Phase 4.3: CommandLanes — 工具执行路径隔离（高风险工具走独立 lane）
    try {
      const { CommandLanes } = require('../infra/command-lanes');
      const lanes = new CommandLanes({ defaultTimeoutMs: 60_000 });
      (this as Record<string, unknown>).__commandLanes = lanes;
      log.info('CommandLanes 已初始化（高风险工具隔离）');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, 'CommandLanes 初始化失败 — degraded');
    }

    // 资源清理
    const cleanup = () => {
      log.info('正在关闭...');
      if (this.sentinelRunner) { this.sentinelRunner.stop(); setGlobalSentinelRunner(null); this.sentinelRunner = null; }
      destroyGlobalScheduler();
      this.scheduler = null;
      if (this.server) { this.server.close(); this.server = null; }
    };
    this.cleanupHandlers.push(cleanup);
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
  }

  async stop(): Promise<void> {
    // Phase 1.2: 优雅关闭 — 排干活跃会话
    try {
      const { SessionStore } = await import('../store/session-store');
      const sessionStore = new SessionStore(this.db);
      await this.gracefulShutdown.drain(sessionStore);
    } catch (err: unknown) {
      log.warn({ err }, '优雅关闭排干失败 — degraded');
    }

    for (const h of this.cleanupHandlers) h();
    this.cleanupHandlers = [];
    log.info('SynovaAgent 已停止');
  }

  getServer(): Server | null { return this.server; }
  getScheduler(): CronScheduler | null { return this.scheduler; }
  getGracefulShutdown(): GracefulShutdown { return this.gracefulShutdown; }
}
