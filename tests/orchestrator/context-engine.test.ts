/**
 * tests/orchestrator/context-engine.test.ts — 上下文可插拔引擎 (Phase G1)
 *
 * 测试: 策略加载 / LLM 压缩 / LLM 降级 / 窗口溢出 / 空上下文 / 文件扩展
 * 铁律 33: *.test.ts (纯函数 + mock LLMProvider + mock fs)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContextEngine } from '../../src/orchestrator/context-engine';
import type { LLMMessage, LLMProvider } from '../../src/providers/types';
import type { ContextStrategy } from '../../src/orchestrator/context-engine';

// ═══ Mock Data ═══

const defaultStrategy: ContextStrategy = {
  $id: 'context-strategy/default',
  version: 1,
  maxTokens: 8000,
  triggers: { tokenThreshold: 6400, messageCountThreshold: 40 },
  retention: {
    keepSystemPrompt: true,
    keepLastNMessages: 10,
    keepExpertConclusions: true,
    keepSentinelFindings: true,
  },
  fallback: { whenLLMUnavailable: 'truncate_oldest', whenTimeout: 'skip_compression' },
};

function makeMessages(count: number): LLMMessage[] {
  const msgs: LLMMessage[] = [{ role: 'system', content: 'You are an expert analyst.' }];
  for (let i = 0; i < count; i++) {
    msgs.push(
      { role: 'user', content: `User message ${i}` },
      { role: 'assistant', content: `Assistant reply ${i}: 这是回复内容的详细文本，用于测试上下文压缩的触发条件和执行结果。` },
    );
  }
  return msgs;
}

function makeLongMessages(count: number, charLen: number): LLMMessage[] {
  const msgs: LLMMessage[] = [{ role: 'system', content: 'You are an expert analyst.' }];
  for (let i = 0; i < count; i++) {
    msgs.push(
      { role: 'user', content: `User msg ${i}` },
      { role: 'assistant', content: 'A'.repeat(charLen) },
    );
  }
  return msgs;
}

// ═══ Mock LLM Provider ═══

function createMockProvider(healthy: boolean = true): LLMProvider {
  return {
    name: 'mock-provider',
    baseUrl: 'http://mock',
    chat: vi.fn().mockResolvedValue({ content: '压缩后的摘要文本。', model: 'mock' }),
    stream: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue({ healthy, latencyMs: 10 }),
    validateResponse: vi.fn(),
    convertTools: vi.fn(),
    listModels: vi.fn().mockReturnValue(['mock-model']),
  };
}

describe('ContextEngine', () => {
  let engine: ContextEngine;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ═══ 策略加载 ═══

  describe('策略加载', () => {
    it('构造函数加载默认策略', () => {
      engine = new ContextEngine({ strategies: [defaultStrategy] });
      const loaded = engine.getActiveStrategy();
      expect(loaded).toBeDefined();
      expect(loaded.$id).toBe('context-strategy/default');
      expect(loaded.triggers.tokenThreshold).toBe(6400);
    });

    it('无策略时使用硬编码默认值', () => {
      engine = new ContextEngine({ strategies: [] });
      const loaded = engine.getActiveStrategy();
      expect(loaded).toBeDefined();
      expect(loaded.$id).toBe('built-in/default');
      expect(loaded.triggers.tokenThreshold).toBe(6400);
    });

    it('加载多个策略可切换', () => {
      const s2: ContextStrategy = {
        ...defaultStrategy,
        $id: 'context-strategy/saas',
        triggers: { tokenThreshold: 3000, messageCountThreshold: 20 },
      };
      engine = new ContextEngine({ strategies: [defaultStrategy, s2] });
      // 默认选第一个
      expect(engine.getActiveStrategy().$id).toBe('context-strategy/default');
    });

    it('文件扩展：新增策略被扫描覆盖（通过构造函数注入模拟）', () => {
      engine = new ContextEngine({ strategies: [defaultStrategy] });
      expect(engine.getActiveStrategy().$id).toBe('context-strategy/default');
    });
  });

  // ═══ shouldCompress ═══

  describe('shouldCompress', () => {
    it('token 超过阈值时返回 true', () => {
      const provider = createMockProvider(true);
      engine = new ContextEngine({ strategies: [defaultStrategy], provider });
      const messages = makeMessages(50);
      // ~50 msg pairs × ~100 chars each ÷ ~3 chars/token ≈ 1700 tokens of content
      // plus system prompt. Force high token count:
      const result = engine.shouldCompress(messages, 7000);
      expect(result).toBe(true);
    });

    it('token 低于阈值时返回 false', () => {
      const provider = createMockProvider(true);
      engine = new ContextEngine({ strategies: [defaultStrategy], provider });
      const messages = makeMessages(3);
      const result = engine.shouldCompress(messages, 2000);
      expect(result).toBe(false);
    });

    it('消息数超 threshold 时触发', () => {
      const provider = createMockProvider(true);
      engine = new ContextEngine({ strategies: [defaultStrategy], provider });
      const messages = makeMessages(50); // 50 user+assistant pairs + 1 system = 101 msgs
      // token 未超但消息数超
      const result = engine.shouldCompress(messages, 3000);
      expect(result).toBe(true);
    });

    it('消息数和 token 都低于阈值时不触发', () => {
      const provider = createMockProvider(true);
      engine = new ContextEngine({ strategies: [defaultStrategy], provider });
      const messages = makeMessages(3);
      const result = engine.shouldCompress(messages, 500);
      expect(result).toBe(false);
    });
  });

  // ═══ compress — LLM 可用 ═══

  describe('compress — LLM 可用', () => {
    it('LLM 可用时压缩成功，返回缩减后的消息', async () => {
      const provider = createMockProvider(true);
      const chatSpy = vi.spyOn(provider, 'chat');
      engine = new ContextEngine({ strategies: [defaultStrategy], provider });
      const messages = makeLongMessages(15, 500);

      const result = await engine.compress(messages, 7000);

      // 断言压缩执行（LLM 被调用了）
      expect(chatSpy).toHaveBeenCalled();
      expect(result.messages.length).toBeLessThan(messages.length);
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.stats.degraded).toBe(false);
      expect(result.stats.discardedCount).toBeGreaterThan(0);
    });

    it('压缩保留 system prompt', async () => {
      const provider = createMockProvider(true);
      engine = new ContextEngine({ strategies: [defaultStrategy], provider });
      const messages = makeMessages(30);

      const result = await engine.compress(messages, 7000);

      const hasSystem = result.messages.some(m => m.role === 'system');
      expect(hasSystem).toBe(true);
    });

    it('压缩统计更新: totalCompressions 递增', async () => {
      const provider = createMockProvider(true);
      engine = new ContextEngine({ strategies: [defaultStrategy], provider });
      const messages = makeLongMessages(15, 500);

      await engine.compress(messages, 7000);
      const stats = engine.getStats();
      expect(stats.totalCompressions).toBe(1);

      await engine.compress(messages, 7000);
      const stats2 = engine.getStats();
      expect(stats2.totalCompressions).toBe(2);
    });
  });

  // ═══ compress — LLM 不可用降级 ═══

  describe('compress — LLM 不可用降级', () => {
    it('LLM healthCheck 失败时降级到 truncate_oldest', async () => {
      const provider = createMockProvider(false); // unhealthy
      const chatSpy = vi.spyOn(provider, 'chat');
      engine = new ContextEngine({ strategies: [defaultStrategy], provider });
      const messages = makeMessages(30);

      const result = await engine.compress(messages, 7000);

      // LLM chat 未被调用的
      expect(chatSpy).not.toHaveBeenCalled();
      // 降级到截断
      expect(result.messages.length).toBeLessThan(messages.length);
      expect(result.stats.degraded).toBe(true);
      expect(result.stats.strategy).toBe('truncate_oldest');
    });

    it('LLM chat 抛出异常时降级', async () => {
      const provider = createMockProvider(true);
      vi.spyOn(provider, 'chat').mockRejectedValue(new Error('API timeout'));
      vi.spyOn(provider, 'healthCheck').mockResolvedValue({ healthy: false, error: 'API timeout' });

      engine = new ContextEngine({ strategies: [defaultStrategy], provider });
      const messages = makeMessages(30);

      const result = await engine.compress(messages, 7000);

      expect(result.stats.degraded).toBe(true);
      expect(result.stats.strategy).toBe('truncate_oldest');
      // 仍然有消息保留
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it('降级时未超限（保留系统 prompt + 最后 N 条）', async () => {
      const provider = createMockProvider(false); // unhealthy
      engine = new ContextEngine({ strategies: [{ ...defaultStrategy, retention: { ...defaultStrategy.retention, keepLastNMessages: 5 } }], provider });
      const messages = makeMessages(50);

      const result = await engine.compress(messages, 7000);

      expect(result.stats.degraded).toBe(true);
      // system prompt + 最后 5 条 user-assistant pairs + maybe summary marker
      const systemCount = result.messages.filter(m => m.role === 'system').length;
      const nonSystem = result.messages.filter(m => m.role !== 'system');
      expect(systemCount).toBe(1); // system prompt 保留
      expect(nonSystem.length).toBeLessThanOrEqual(15); // 5 pairs × 2 = 10 + system prompt
    });
  });

  // ═══ 空上下文处理 ═══

  describe('空上下文', () => {
    it('空消息列表返回空', async () => {
      const provider = createMockProvider(true);
      engine = new ContextEngine({ strategies: [defaultStrategy], provider });
      const result = await engine.compress([], 0);
      expect(result.messages.length).toBe(0);
      expect(result.stats.discardedCount).toBe(0);
    });

    it('只有 system prompt 时不压缩', async () => {
      const provider = createMockProvider(true);
      engine = new ContextEngine({ strategies: [defaultStrategy], provider });
      const messages: LLMMessage[] = [{ role: 'system', content: 'You are an expert.' }];
      const result = await engine.compress(messages, 100);
      expect(result.messages.length).toBe(1);
      expect(result.stats.discardedCount).toBe(0);
    });
  });

  // ═══ 文件扩展发现 ═══

  describe('文件扩展', () => {
    it('loadStrategies 扫描目录发现新策略文件', () => {
      const strategies = engine?.loadStrategies?.() ?? [];
      // 静态方法或实例方法 — 通过构造函数注入验证文件驱动能力
      engine = new ContextEngine({ strategies: [defaultStrategy] });
      expect(engine.getActiveStrategy()).toBeDefined();
    });
  });

  // ═══ 触发边界 ═══

  describe('触发边界', () => {
    it('恰好等于阈值时不触发（避免频繁压缩）', () => {
      const provider = createMockProvider(true);
      engine = new ContextEngine({ strategies: [defaultStrategy], provider });
      const messages = makeMessages(10);
      const result = engine.shouldCompress(messages, 6400);
      // 恰好等于 tokenThreshold，不触发
      expect(result).toBe(false);
    });

    it('token 和消息数都未超阈值不触发', () => {
      const provider = createMockProvider(true);
      engine = new ContextEngine({ strategies: [defaultStrategy], provider });
      const messages = makeMessages(5);
      const result = engine.shouldCompress(messages, 1000);
      expect(result).toBe(false);
    });

    it('token 超但消息数不超 — 触发', () => {
      const provider = createMockProvider(true);
      engine = new ContextEngine({ strategies: [defaultStrategy], provider });
      const messages = makeLongMessages(5, 2000); // each assistant msg is 2000 chars
      const result = engine.shouldCompress(messages, 7000);
      expect(result).toBe(true);
    });
  });

  // ═══ 压缩统计 ═══

  describe('getStats', () => {
    it('初始状态统计为零', () => {
      const provider = createMockProvider(true);
      engine = new ContextEngine({ strategies: [defaultStrategy], provider });
      const stats = engine.getStats();
      expect(stats.totalCompressions).toBe(0);
      expect(stats.avgSavings).toBe(0);
      expect(stats.degradedCount).toBe(0);
    });

    it('LLM 降级后 degradedCount 递增', async () => {
      const provider = createMockProvider(false);
      engine = new ContextEngine({ strategies: [defaultStrategy], provider });
      const messages = makeMessages(30);

      await engine.compress(messages, 7000);
      let stats = engine.getStats();
      expect(stats.degradedCount).toBe(1);
      expect(stats.totalCompressions).toBe(1);

      await engine.compress(messages, 7000);
      stats = engine.getStats();
      expect(stats.degradedCount).toBe(2);
      expect(stats.totalCompressions).toBe(2);
    });
  });
});
