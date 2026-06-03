/**
 * providers.test.ts — LLM Provider 测试 (Era 1.1, iron law 0-2 Step 2)
 *
 * 验证: Provider 接口 + 工厂创建 + 连接测试 + Setup 流程
 */
import { describe, it, expect } from 'vitest';
import { createProvider } from '../src/providers';
import type { LLMProvider } from '../src/providers/types';

// ═══ Provider Creation ═══

describe('createProvider', () => {
  it('Given DeepSeek config, When created, Then returns provider with correct name', () => {
    const p = createProvider('deepseek', { apiKey: 'sk-test' });
    expect(p.name).toBe('deepseek');
    expect(p.baseUrl).toContain('deepseek.com');
  });

  it('Given OpenAI config, When created, Then returns provider with correct name', () => {
    const p = createProvider('openai', { apiKey: 'sk-test' });
    expect(p.name).toBe('openai');
    expect(p.baseUrl).toContain('openai.com');
  });

  it('Given gateway config, When created with host, Then returns provider', () => {
    const p = createProvider('gateway', { gatewayHost: 'http://127.0.0.1:18789' });
    expect(p.name).toBe('gateway');
    expect(p.baseUrl).toContain('18789');
  });

  it('Given unknown type, When created, Then throws', () => {
    expect(() => createProvider('unknown' as any, {})).toThrow(/不支持的 Provider/);
  });

  it('Given DeepSeek without apiKey, When created, Then has empty key (lazy check)', () => {
    const p = createProvider('deepseek', {});
    // Provider 创建不抛错——healthCheck 时才会发现
    expect(p.name).toBe('deepseek');
  });
});

// ═══ Health Check ═══

describe('Provider healthCheck', () => {
  it('Given provider with invalid key, When healthCheck, Then returns unhealthy', async () => {
    const p = createProvider('deepseek', { apiKey: 'invalid-test-key' });
    const result = await p.healthCheck();
    // 假 key → API 返回 401
    expect(result.healthy).toBe(false);
  });

  it('Given provider with empty key, When healthCheck, Then returns unhealthy with missing_key', async () => {
    const p = createProvider('deepseek', {});
    const result = await p.healthCheck();
    expect(result.healthy).toBe(false);
    expect(result.error).toContain('API Key');
  });
});

// ═══ LLMProvider Interface Compliance ═══

describe('LLMProvider interface', () => {
  // 验证所有 provider 都实现了完整接口
  const configs = [
    { type: 'deepseek' as const, opts: { apiKey: 'sk-test' } },
    { type: 'openai' as const, opts: { apiKey: 'sk-test' } },
    { type: 'gateway' as const, opts: { gatewayHost: 'http://127.0.0.1:18789' } },
  ];

  for (const { type, opts } of configs) {
    it(`[${type}] implements full LLMProvider interface`, () => {
      const p = createProvider(type, opts);
      expect(typeof p.name).toBe('string');
      expect(typeof p.baseUrl).toBe('string');
      expect(typeof p.chat).toBe('function');
      expect(typeof p.stream).toBe('function');
      expect(typeof p.healthCheck).toBe('function');
      expect(typeof p.listModels).toBe('function');
    });
  }
});
