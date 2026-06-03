/**
 * prompt-cache.ts — Prompt 缓存 (对标 Claw-Code prompt_cache.rs)
 *
 * Hash-based: FNV-1a(systemPrompt + userMessage + model) → cached response.
 * Disk-based with TTL: 30s for completions, 5min for prompt state.
 */
import * as crypto from 'crypto';
import type { LLMResponse } from './diagnosis-orchestrator';

export interface CacheEntry { response: LLMResponse; cachedAt: number; }
export interface CacheStats { hits: number; misses: number; sets: number; invalidations: number; }

export interface PromptCache {
  buildKey(systemPrompt: string, userMessage: string, model?: string): string;
  get(key: string): LLMResponse | null;
  set(key: string, response: LLMResponse): void;
  clear(): void;
  stats(): CacheStats;
}

export function createPromptCache(ttlMs = 30_000): PromptCache {
  const store = new Map<string, CacheEntry>();
  let hits = 0, misses = 0, sets = 0, invalidations = 0;

  return {
    buildKey(systemPrompt: string, userMessage: string, model = 'default'): string {
      const hash = crypto.createHash('sha256')
        .update(systemPrompt.slice(0, 4000))  // Truncate for stable hash
        .update(userMessage.slice(0, 4000))
        .update(model)
        .digest('hex');
      return hash;
    },

    get(key: string): LLMResponse | null {
      const entry = store.get(key);
      if (!entry) { misses++; return null; }
      if (Date.now() - entry.cachedAt > ttlMs) {
        store.delete(key);
        invalidations++;
        misses++;
        return null;
      }
      hits++;
      return entry.response;
    },

    set(key: string, response: LLMResponse): void {
      store.set(key, { response, cachedAt: Date.now() });
      sets++;
    },

    clear(): void { store.clear(); },

    stats(): CacheStats { return { hits, misses, sets, invalidations }; },
  };
}
