/**
 * prompt-cache.test.ts — Prompt 缓存测试 (铁律 0-2)
 */
import { createPromptCache, type PromptCache } from '../prompt-cache';

describe('PromptCache', () => {
  let cache: PromptCache;

  beforeEach(() => { cache = createPromptCache(1000); }); // 1s TTL for testing

  it('Given new prompt, When cached, Then returns cached on second call', () => {
    const key = cache.buildKey('sys', 'user', 'model');
    cache.set(key, { content: 'response', model: 'test' });
    const cached = cache.get(key);
    expect(cached).not.toBeNull();
    expect(cached!.content).toBe('response');
  });

  it('Given different prompts, When cached, Then returns null for different user message', () => {
    const k1 = cache.buildKey('sys', 'user1', 'm');
    const k2 = cache.buildKey('sys', 'user2', 'm');
    cache.set(k1, { content: 'r1', model: 'm' });
    expect(cache.get(k2)).toBeNull();
  });

  it('Given expired cache, When TTL passed, Then returns null', async () => {
    const key = cache.buildKey('s', 'u', 'm');
    cache.set(key, { content: 'r', model: 'm' });
    await new Promise(r => setTimeout(r, 1100)); // 1.1s > 1s TTL
    expect(cache.get(key)).toBeNull();
  });

  it('Given stats, When cache used, Then tracks hits and misses', () => {
    const key = cache.buildKey('s', 'u', 'm');
    cache.get(key); // miss
    cache.set(key, { content: 'r', model: 'm' });
    cache.get(key); // hit
    const stats = cache.stats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it('Given cache, When cleared, Then returns null', () => {
    const key = cache.buildKey('s', 'u', 'm');
    cache.set(key, { content: 'r', model: 'm' });
    cache.clear();
    expect(cache.get(key)).toBeNull();
  });
});
