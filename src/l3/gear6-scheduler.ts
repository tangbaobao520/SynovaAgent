/**
 * l3/gear6-scheduler.ts — 齿轮6 知识提取定时任务 (M2)
 *
 * 定时运行: 扫描新数据 → 提取知识片段 → 写入 KnowledgeStore
 * Cron: 每 6 小时运行一次
 *
 * 功能:
 *   1. 扫描 Phase 0 诊断数据 → 提取长消息作为 KnowledgeChunk
 *   2. 扫描长文档 → 自动分块
 *   3. 检测过期 FAQ → 标记待验证 (未来)
 */
import { createLogger } from '../logger';
import { createKnowledgeAgent } from './knowledge-agent';

const log = createLogger('l3/gear6-scheduler');

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

/** 启动齿轮6 定时任务 (每6小时) */
export function startGear6Scheduler(intervalMs = 21_600_000): void {
  if (schedulerTimer) return;

  const agent = createKnowledgeAgent();

  // 立即运行一次
  void agent.runGear6().then(r => {
    log.info({ extracted: r.extracted, errors: r.errors.length }, '齿轮6 首次运行完成');
  });

  // 定时运行
  schedulerTimer = setInterval(() => {
    void agent.runGear6().then(r => {
      log.info({ extracted: r.extracted, errors: r.errors.length }, '齿轮6 定时运行完成');
    });
  }, intervalMs);

  log.info({ intervalMs }, '齿轮6 调度器已启动 (每6h)');
}

export function stopGear6Scheduler(): void {
  if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null; }
}
