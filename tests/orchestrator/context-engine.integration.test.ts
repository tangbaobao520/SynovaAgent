/**
 * tests/orchestrator/context-engine.integration.test.ts — ContextEngine 集成测试
 *
 * 验证 ContextEngine 与 ContextCompressor + provider 的集成。
 * 铁律 33: *.integration.test.ts
 * 铁律 12: 集成测试 cover 真实路由，不 mock 管线
 */
import { describe, it, expect, vi } from 'vitest';
import { ContextEngine } from '../../src/orchestrator/context-engine';
import type { LLMProvider } from '../../src/providers/types';

describe('ContextEngine integration', () => {
  it('无 provider 时 compress 降级不抛异常', async () => {
    const engine = new ContextEngine({ strategies: [] });
    const result = await engine.compress(
      [{ role: 'system', content: 'test' }, { role: 'user', content: 'hello' }],
      100,
    );
    expect(result.messages.length).toBeGreaterThanOrEqual(1);
    expect(result.stats.degraded).toBe(true);
  });

  it('provider healthCheck 失败时降级', async () => {
    const mockProvider = {
      healthCheck: vi.fn().mockResolvedValue(false),
      chat: vi.fn(),
    } as unknown as LLMProvider;

    const engine = new ContextEngine({ strategies: [], provider: mockProvider });
    const messages = [
      { role: 'system' as const, content: 'system prompt' },
      { role: 'user' as const, content: 'user message' },
    ];
    const result = await engine.compress(messages, 100);
    expect(result.stats.degraded).toBe(true);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it('shouldCompress 超过阈值返回 true', () => {
    const engine = new ContextEngine({ strategies: [] });
    const manyMessages = Array(50).fill(null).map((_, i) => ({
      role: (i === 0 ? 'system' : 'user') as 'system' | 'user',
      content: `message ${i}`,
    }));
    const should = engine.shouldCompress(manyMessages, 10000);
    expect(should).toBe(true);
  });
});
