/**
 * infra/command-lanes.ts — 命令Lane (Phase 4.1)
 *
 * 进程隔离: 每条 lane 内部串行, lane 之间并行。
 * 卡住的对话 (main lane) 不阻塞哨兵扫描 (cron lane)。
 *
 * 铁律 24: 降级路径有 log.warn
 * 铁律 38: 纯类型安全
 */
import { createLogger } from '@synova/logger';

const log = createLogger('infra/command-lanes');

// ═══ 类型 ═══

export type LaneId = 'main' | 'cron' | 'expert';

export interface CommandLanesConfig {
  /** 任务超时时间（毫秒） */
  defaultTimeoutMs: number;
}

export interface LaneStats {
  pending: number;
  active: number;
  completed: number;
  failed: number;
}

// ═══ CommandLanes ═══

export class CommandLanes {
  private lanes = new Map<LaneId, { queue: Array<() => Promise<void>>; running: boolean; completed: number; failed: number }>();
  private config: CommandLanesConfig;
  private _shutdown = false;

  constructor(config?: Partial<CommandLanesConfig>) {
    this.config = { defaultTimeoutMs: config?.defaultTimeoutMs ?? 30_000 };
    for (const id of ['main', 'cron', 'expert'] as LaneId[]) {
      this.lanes.set(id, { queue: [], running: false, completed: 0, failed: 0 });
    }
  }

  /**
   * 提交任务到指定 lane。
   * 任务在 lane 内部串行执行，不同 lane 之间并行。
   */
  async execute<T>(laneId: LaneId, task: () => Promise<T>): Promise<T> {
    if (this._shutdown) {
      throw new Error('CommandLanes 已关闭，拒绝新任务');
    }

    const lane = this.lanes.get(laneId);
    if (!lane) throw new Error(`未知 lane: ${laneId}`);

    return new Promise<T>((resolve, reject) => {
      const run = async () => {
        const timeout = setTimeout(() => {
          reject(new Error(`任务超时 (${this.config.defaultTimeoutMs}ms)`));
        }, this.config.defaultTimeoutMs);

        try {
          const result = await task();
          lane.completed++;
          resolve(result);
        } catch (err: unknown) {
          log.warn({ err: err instanceof Error ? err.message : String(err) }, "命令通道任务执行");
          lane.failed++;
          reject(err);
        } finally {
          clearTimeout(timeout);
          this.processNext(laneId, lane);
        }
      };

      lane.queue.push(run);
      if (!lane.running) {
        lane.running = true;
        this.processNext(laneId, lane);
      }
    });
  }

  /** 关闭所有 lane，拒绝新任务 */
  shutdown(): void {
    this._shutdown = true;
    log.info('CommandLanes 已关闭');
  }

  /** 获取 lane 统计 */
  getStats(laneId: LaneId): LaneStats {
    const lane = this.lanes.get(laneId);
    if (!lane) return { pending: 0, active: 0, completed: 0, failed: 0 };
    return {
      pending: lane.queue.length,
      active: lane.running ? 1 : 0,
      completed: lane.completed,
      failed: lane.failed,
    };
  }

  /** 获取所有 lane 的统计 */
  getAllStats(): Record<LaneId, LaneStats> {
    return {
      main: this.getStats('main'),
      cron: this.getStats('cron'),
      expert: this.getStats('expert'),
    };
  }

  // ═══ Private ═══

  private processNext(laneId: LaneId, lane: { queue: Array<() => Promise<void>>; running: boolean }): void {
    if (lane.queue.length === 0) {
      lane.running = false;
      return;
    }
    const next = lane.queue.shift()!;
    next().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, laneId }, `Lane ${laneId} 任务失败`);
    });
  }
}
