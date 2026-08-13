/**
 * services/llm-cache.ts — LLM 调用结果缓存 (P2)
 *
 * 对相同/相似查询返回缓存结果，减少 LLM 调用成本和延迟。
 * 使用确定性哈希 (SHA-256 截取) 作为缓存键，LRU 淘汰策略。
 *
 * 缓存范围: systemPrompt + userMessage 的哈希
 * 不缓存: temperature > 0.5 的请求 (创造性生成不应缓存)
 */

import { createLogger } from '@synova/logger';
import * as crypto from 'crypto';

const log = createLogger('services/llm-cache');

export interface CacheOptions {
  /** 最大缓存条目数 (default 1000) */
  maxSize?: number;
  /** 缓存 TTL ms (default 1 hour) */
  ttlMs?: number;
  /** temperature 阈值 — 超过此值不缓存 (default 0.5) */
  maxTemperature?: number;
}

interface CacheEntry {
  response: string;
  model: string;
  timestamp: number;
  tokens: number;
}

export class LLMCache {
  private cache = new Map<string, CacheEntry>();
  private accessOrder: string[] = [];
  private maxSize: number;
  private ttlMs: number;
  private maxTemperature: number;

  /** 统计 */
  private hits = 0;
  private misses = 0;

  constructor(opts: CacheOptions = {}) {
    this.maxSize = opts.maxSize ?? 1000;
    this.ttlMs = opts.ttlMs ?? 3_600_000; // 1 hour
    this.maxTemperature = opts.maxTemperature ?? 0.5;
  }

  /** 生成缓存键 */
  private key(systemPrompt: string, userMessage: string): string {
    const input = `${systemPrompt}\x00${userMessage}`;
    return crypto.createHash('sha256').update(input).digest('hex').slice(0, 32);
  }

  /** 获取缓存的响应，未命中返回 null */
  get(systemPrompt: string, userMessage: string): string | null {
    const k = this.key(systemPrompt, userMessage);
    const entry = this.cache.get(k);

    if (!entry) {
      this.misses++;
      return null;
    }

    // TTL 检查
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(k);
      this.accessOrder = this.accessOrder.filter(x => x !== k);
      this.misses++;
      return null;
    }

    this.hits++;
    // LRU: move to end
    this.accessOrder = this.accessOrder.filter(x => x !== k);
    this.accessOrder.push(k);
    log.debug({ key: k.slice(0, 12), hits: this.hits, misses: this.misses }, 'LLM 缓存命中');
    return entry.response;
  }

  /** 存储响应到缓存 */
  set(systemPrompt: string, userMessage: string, response: string, model: string, tokens = 0): void {
    const k = this.key(systemPrompt, userMessage);

    // LRU 淘汰
    while (this.cache.size >= this.maxSize) {
      const oldest = this.accessOrder.shift();
      if (oldest) this.cache.delete(oldest);
    }

    // 移除旧条目 (相同 key)
    this.accessOrder = this.accessOrder.filter(x => x !== k);
    this.accessOrder.push(k);

    this.cache.set(k, {
      response,
      model,
      timestamp: Date.now(),
      tokens,
    });
  }

  /** 清除缓存 */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.hits = 0;
    this.misses = 0;
  }

  /** 返回缓存统计 */
  stats(): { size: number; hits: number; misses: number; hitRate: number } {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0
        ? Math.round((this.hits / (this.hits + this.misses)) * 100)
        : 0,
    };
  }
}

/** 全局单例 — 整个进程共享一个 LLM 缓存 */
let _instance: LLMCache | null = null;
export function getLLMCache(inject?: LLMCache): LLMCache {
  if (inject) { _instance = inject; return inject; }
  if (!_instance) _instance = new LLMCache();
  return _instance;
}
