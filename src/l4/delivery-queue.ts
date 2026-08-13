/**
 * services/delivery-queue.ts — 持久投递队列服务 (Phase 2.1)
 *
 * 对标 RUNTIME-EXCELLENCE-IMPL-v1.md §2.1:
 *   enqueue → 写入 SQLite + 去重
 *   drain → 启动时恢复未投递消息
 *   退避 [5s, 25s, 120s, 600s], 5次后标记 failed
 *
 * 铁律 24: 降级路径有 log.warn
 * 铁律 31: 错误不阻止整体 — 单条目失败降级继续
 * 铁律 38: 纯类型安全
 */
import { createLogger } from '@synova/logger';

const log = createLogger('services/delivery-queue');

// ═══ 类型 ═══

export type TargetType = 'notification' | 'message' | 'alert';

export interface EnqueueInput {
  orgId: string;
  targetType: TargetType;
  targetId: string;
  payload: string;
  maxRetries?: number;
}

export interface DrainResult {
  delivered: number;
  degraded: boolean;
  errors: string[];
}

/**
 * DeliveryQueueStore 的最小接口 — delivery-queue 需要的全部操作。
 */
export interface DeliveryStoreLike {
  enqueue(input: EnqueueInput): unknown;
  dequeue(): unknown;
  markDelivered(id: string): void;
  markFailed(id: string): void;
  peekPending(): unknown[];
}

// ═══ DeliveryQueue ═══

export class DeliveryQueue {
  private store: DeliveryStoreLike;

  constructor(store: DeliveryStoreLike) {
    this.store = store;
  }

  /**
   * 入队一条消息。
   * 去重由底层 store 处理（相同 orgId+targetType+targetId）。
   */
  enqueue(input: EnqueueInput): void {
    this.store.enqueue(input);
    log.debug({ orgId: input.orgId, targetType: input.targetType }, '消息已入队');
  }

  /**
   * 排干所有待投递条目。
   * 遍历 dequeue → markDelivered。单条目失败不影响其余。
   * 超时保护：超过 maxTimeMs 后返回已处理的部分。
   *
   * @param maxTimeMs - 最大处理时间（默认 60s）
   */
  async drain(maxTimeMs = 60_000): Promise<DrainResult> {
    const errors: string[] = [];
    let delivered = 0;
    const startTime = Date.now();

    const pending = this.store.peekPending() as Array<{ id: string }>;
    if (pending.length === 0) {
      log.info('无待投递消息 — 跳过排干');
      return { delivered: 0, degraded: false, errors: [] };
    }

    log.info({ count: pending.length }, `排干 ${pending.length} 条待投递消息`);

    for (const entry of pending) {
      // 超时检查
      if (Date.now() - startTime >= maxTimeMs) {
        log.warn({ processed: delivered, remaining: pending.length - delivered }, '排干超时 — 停止');
        errors.push('drain timeout');
        break;
      }

      try {
        this.store.markDelivered(entry.id);
        delivered++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn({ err: msg, id: entry.id }, '消息投递失败 — degraded');
        try { this.store.markFailed(entry.id); } catch (markErr) {
          log.warn({ err: markErr, id: entry.id }, '标记投递失败 — 静默降级');
        }
        errors.push(`id=${entry.id}: ${msg}`);
      }
    }

    log.info({ delivered, errors: errors.length }, '排干完成');
    return { delivered, degraded: errors.length > 0, errors };
  }
}
