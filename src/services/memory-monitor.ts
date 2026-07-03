/**
 * services/memory-monitor.ts — 内存监控 (Phase 5.3)
 *
 * 每 5 分钟记录 RSS 内存使用量。启动时基线、关闭时最终快照。
 * process.memoryUsage() 不可用 → WARNING 后禁用。
 *
 * 铁律 38: 纯类型安全
 */
import { createLogger } from '@synova/logger';

const log = createLogger('services/memory-monitor');

const INTERVAL_MS = 300_000; // 5 分钟

export interface MemoryStats {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  timestamp: string;
}

export class MemoryMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private _running = false;
  private baseline: MemoryStats | null = null;

  start(): void {
    if (this._running) return;

    if (typeof process.memoryUsage !== 'function') {
      log.warn('process.memoryUsage 不可用 — 内存监控已禁用');
      return;
    }

    this._running = true;
    this.baseline = this.snapshot();
    log.info({ rss: this.baseline.rss, heapUsed: this.baseline.heapUsed }, '[MEMORY] 基线');

    this.timer = setInterval(() => {
      const stats = this.snapshot();
      log.info({ rss: stats.rss, heapUsed: stats.heapUsed, deltaRss: stats.rss - this.baseline!.rss }, '[MEMORY]');
    }, INTERVAL_MS);

    if (this.timer && typeof this.timer === 'object' && 'unref' in this.timer) {
      this.timer.unref();
    }
  }

  stop(): void {
    if (!this._running) return;
    this._running = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    const final = this.snapshot();
    log.info({ rss: final.rss, heapUsed: final.heapUsed }, '[MEMORY] 最终快照');
  }

  getStats(): MemoryStats {
    return this.snapshot();
  }

  private snapshot(): MemoryStats {
    const usage = process.memoryUsage();
    return {
      rss: usage.rss,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      timestamp: new Date().toISOString(),
    };
  }
}
