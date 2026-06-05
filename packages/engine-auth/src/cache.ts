/**
 * engine-auth/cache.ts — 用户身份 LRU 缓存
 *
 * 容量 10000，TTL 1 小时。
 * 缓存未命中时由 AuthProvider.realGetUserContext 回源查询。
 */
import type { UserContext } from './types';
import { createLogger } from '../../logger/src/index';

const log = createLogger('engine-auth/cache');

interface CacheEntry {
  ctx: UserContext;
  timestamp: number;
}

export interface UserCache {
  get(key: string): UserContext | null;
  set(key: string, ctx: UserContext): void;
  invalidate(key: string): void;
  clear(): void;
  stats(): { size: number; hits: number; misses: number };
}

export function createUserCache(maxSize = 10000, ttlMs = 3_600_000): UserCache {
  const cache = new Map<string, CacheEntry>();
  const accessOrder: string[] = [];
  let hits = 0;
  let misses = 0;

  return {
    get(key: string): UserContext | null {
      const entry = cache.get(key);
      if (!entry) { misses++; return null; }

      if (Date.now() - entry.timestamp > ttlMs) {
        cache.delete(key);
        accessOrder.splice(accessOrder.indexOf(key), 1);
        misses++;
        return null;
      }

      hits++;
      // LRU: move to end
      const idx = accessOrder.indexOf(key);
      if (idx > -1) { accessOrder.splice(idx, 1); accessOrder.push(key); }
      return entry.ctx;
    },

    set(key: string, ctx: UserContext): void {
      // LRU eviction
      while (cache.size >= maxSize) {
        const oldest = accessOrder.shift();
        if (oldest) cache.delete(oldest);
      }

      const idx = accessOrder.indexOf(key);
      if (idx > -1) accessOrder.splice(idx, 1);
      accessOrder.push(key);

      cache.set(key, { ctx, timestamp: Date.now() });
    },

    invalidate(key: string): void {
      cache.delete(key);
      const idx = accessOrder.indexOf(key);
      if (idx > -1) accessOrder.splice(idx, 1);
      log.debug({ key }, '用户缓存已失效');
    },

    clear(): void {
      cache.clear();
      accessOrder.length = 0;
      hits = 0; misses = 0;
    },

    stats() {
      return { size: cache.size, hits, misses };
    },
  };
}
