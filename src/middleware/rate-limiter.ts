/**
 * middleware/rate-limiter.ts — 操作频率限制 (D243)
 *
 * 1h 窗口内操作次数检查。配合 AnomalyDetector 阈值触发冻结。
 */
import { createLogger } from '@synova/logger';

const log = createLogger('middleware/rate-limiter');

interface RateEntry {
  timestamps: number[];
}

const WINDOW_MS = 3600000; // 1h
const store = new Map<string, RateEntry>();

export interface RateCheckResult {
  blocked: boolean;
  count: number;
  reason?: string;
}

/**
 * 记录操作并检查频率。
 *
 * @param userId    - 用户 ID
 * @param operation - 操作类型
 * @param limit     - 1h 窗口上限（默认 50）
 * @returns 是否应阻断 + 当前计数
 */
export function checkRateLimit(userId: string, operation: string, limit: number = 50): RateCheckResult {
  const key = `${userId}:${operation}`;
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // 清理过期记录
  entry.timestamps = entry.timestamps.filter(t => t > cutoff);
  entry.timestamps.push(now);

  const count = entry.timestamps.length;

  if (count > limit) {
    log.warn({ userId, operation, count, limit }, '操作频率超限 — 建议冻结');
    return { blocked: true, count, reason: `1h内${operation}${count}次, 超过${limit}次上限` };
  }

  return { blocked: false, count };
}

/**
 * 清理过期缓存（测试用）。
 */
export function clearRateStore(): void {
  store.clear();
}
