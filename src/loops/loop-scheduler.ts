/**
 * src/loops/loop-scheduler.ts — 多尺度循环调度器 (D91)
 *
 * Auth Doc A1 LoopEng Amendment — Correction 1.
 * 消费 LoopTriggerConfig[] + CronScheduler，管理 6 循环 x 3 尺度的触发调度。
 *
 * 功能:
 *   - registerLoop(config): 注册循环的三个尺度
 *   - onEvent(eventType, payload): 事件驱动触发入口
 *   - getNextTrigger(loopId, scale): 查询下次触发时间
 *
 * 契约:
 *   @input  — LoopTriggerConfig[] + CronScheduler 实例
 *   @output — 注册结果 / 触发响应 / 查询时间
 *   @degraded — CronScheduler 不可用时 log.warn + 降级
 */
import { createLogger } from '@synova/logger';
import type { LoopTriggerConfig, TriggerScale, ScaleName, TriggerType } from './loop-trigger-config';
import { validateLoopConfig, LOOP_TRIGGER_MATRIX } from './loop-trigger-config';

const log = createLogger('loops/loop-scheduler');

// ═══ 类型定义 ═══

/** 调度器最小依赖接口 */
export interface CronSchedulerLike {
  schedule(name: string, cron: string, handler: () => Promise<void>): string;
}

/** 已注册的循环运行时状态 */
interface RegisteredLoop {
  config: LoopTriggerConfig;
  scales: Map<ScaleName, RegisteredScale>;
}

interface RegisteredScale {
  config: TriggerScale;
  jobId?: string;       // CronScheduler job ID
  lastEventAt?: Date;   // 最近事件触发时间
  nextScheduledAt?: Date;
}

/** 事件触发载荷 */
export interface TriggerEvent {
  type: string;          // 'sentinel:P0' | 'diagnosis:completed' | 'overflow:cash' | ...
  payload?: unknown;
}

/** nextTrigger 查询结果 */
export interface NextTriggerInfo {
  loopId: string;
  scale: ScaleName;
  triggerType: TriggerType;
  nextAt: string | null;
  remainingMs: number;
}

// ═══ LoopScheduler ═══

/**
 * 多尺度循环调度器。
 * 管理 6 循环的触发注册、事件驱动、和下次触发查询。
 */
export class LoopScheduler {
  private loops = new Map<string, RegisteredLoop>();
  private scheduler: CronSchedulerLike | null = null;
  private enabled = true;

  /**
   * @param scheduler — CronScheduler 实例（可选，为 null 时降级）
   */
  constructor(scheduler?: CronSchedulerLike) {
    this.scheduler = scheduler ?? null;
  }

  /**
   * 注册所有默认循环（从 LOOP_TRIGGER_MATRIX 加载）。
   * 运行在 Bootstrap Phase 2e。
   *
   * @returns 注册的循环数
   */
  registerDefaultLoops(): number {
    let count = 0;
    for (const config of LOOP_TRIGGER_MATRIX) {
      const result = this.registerLoop(config);
      if (result) count++;
    }
    log.info({ count, total: LOOP_TRIGGER_MATRIX.length }, '默认循环已注册');
    return count;
  }

  /**
   * 注册一个循环的三个尺度。
   * 每个 cron/hybrid 尺度在 CronScheduler 中创建一个定时任务。
   *
   * @param config — 循环触发配置
   * @returns true=注册成功, false=降级
   */
  registerLoop(config: LoopTriggerConfig): boolean {
    try {
      const errors = validateLoopConfig([config]);
      if (errors.length > 0) {
        log.warn({ loopId: config.loopId, errors }, '循环配置验证失败 — 跳过');
        return false;
      }

      const scales = new Map<ScaleName, RegisteredScale>();

      for (const scale of config.scales) {
        const registered: RegisteredScale = { config: scale };

        // 注册 cron/hybrid 定时任务
        if (scale.triggerType === 'cron' || scale.triggerType === 'hybrid') {
          if (this.scheduler) {
            try {
              const jobId = this.scheduler.schedule(
                `loop-${config.loopId}-${scale.name}`,
                scale.period,
                async () => {
                  log.info({ loopId: config.loopId, scale: scale.name }, '循环定时触发');
                  // 执行 handler（当前为日志占位，后续集成具体逻辑）
                },
              );
              registered.jobId = jobId;
              registered.nextScheduledAt = new Date(Date.now() + 60000);
            } catch (jobErr: unknown) {
              const msg = jobErr instanceof Error ? jobErr.message : String(jobErr);
              log.warn({ err: msg, loopId: config.loopId, scale: scale.name }, '循环定时任务注册失败 — 降级');
            }
          } else {
            log.warn({ loopId: config.loopId, scale: scale.name }, 'CronScheduler 不可用 — 降级为仅事件触发');
          }
        }

        scales.set(scale.name, registered);
      }

      this.loops.set(config.loopId, { config, scales });
      log.info({ loopId: config.loopId, loopName: config.loopName }, '循环已注册');
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, loopId: config.loopId }, '循环注册失败 — 降级');
      return false;
    }
  }

  /**
   * 事件驱动触发入口。
   * 检查所有 event/hybrid 类型的 scale，匹配 eventSource 的触发。
   *
   * @param event — 触发事件
   * @returns 匹配并触发的 scale 列表
   */
  onEvent(event: TriggerEvent): { loopId: string; scale: ScaleName }[] {
    if (!this.enabled) {
      log.debug({ eventType: event.type }, '调度器已禁用，忽略事件');
      return [];
    }

    const triggered: { loopId: string; scale: ScaleName }[] = [];

    for (const [loopId, loop] of this.loops) {
      for (const [scaleName, scale] of loop.scales) {
        if (scale.config.triggerType === 'cron') continue; // cron 不过滤事件

        if (scale.config.eventSource && event.type === scale.config.eventSource) {
          scale.lastEventAt = new Date();
          triggered.push({ loopId, scale: scaleName });
          log.info({ loopId, scale: scaleName, eventType: event.type }, '事件触发循环');
        }
      }
    }

    if (triggered.length === 0) {
      log.debug({ eventType: event.type }, '无匹配循环触发');
    }

    return triggered;
  }

  /**
   * 查询指定循环+尺度的下次触发时间。
   *
   * @param loopId — 循环 ID
   * @param scale — 尺度名称
   * @returns NextTriggerInfo 或 null（未注册）
   */
  getNextTrigger(loopId: string, scale: ScaleName): NextTriggerInfo | null {
    const loop = this.loops.get(loopId);
    if (!loop) return null;

    const registered = loop.scales.get(scale);
    if (!registered) return null;

    const cfg = registered.config;

    // 对于 event 类型，下次触发时间未知
    if (cfg.triggerType === 'event') {
      return {
        loopId,
        scale,
        triggerType: cfg.triggerType,
        nextAt: null,
        remainingMs: -1,
      };
    }

    // 对于 cron/hybrid，使用下次 cron 触发时间
    const now = Date.now();
    const nextAt = registered.nextScheduledAt?.getTime() ?? (now + 3600000);
    const remainingMs = Math.max(0, nextAt - now);

    return {
      loopId,
      scale,
      triggerType: cfg.triggerType,
      nextAt: new Date(nextAt).toISOString(),
      remainingMs,
    };
  }

  /**
   * 列出所有已注册循环。
   */
  listLoops(): { loopId: string; loopName: string; scales: ScaleName[] }[] {
    return [...this.loops.values()].map((l) => ({
      loopId: l.config.loopId,
      loopName: l.config.loopName,
      scales: [...l.scales.keys()],
    }));
  }

  /** 启用/禁用调度器 */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    log.info({ enabled }, '循环调度器状态已更新');
  }
}
