/**
 * provider-detect.test.ts — detectProvider 测试
 *
 * 对标 Claw-Code: Given/When/Then + 手写测试数据
 * 铁律 0-2: 每个 public 函数 >= 2 用例
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectProvider } from '../src/providers/detect';

describe('detectProvider', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    // Clean all LLM-related env vars before each test
    delete process.env.OPENCLAW_GATEWAY_HOST;
    delete process.env.LLM_BASE_URL;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...savedEnv };
  });

  // ── Happy path: default ──

  it('Given no LLM env vars set, When detectProvider called, Then returns deepseek', () => {
    // Given: no OPENCLAW_GATEWAY_HOST, no LLM_BASE_URL
    // When: detecting provider
    const result = detectProvider();

    // Then: defaults to deepseek
    expect(result).toBe('deepseek');
  });

  // ── Gateway ──

  it('Given OPENCLAW_GATEWAY_HOST set, When detectProvider called, Then returns gateway', () => {
    // Given: Gateway host configured
    process.env.OPENCLAW_GATEWAY_HOST = 'http://127.0.0.1:18789';

    // When: detecting
    const result = detectProvider();

    // Then: gateway has priority
    expect(result).toBe('gateway');
  });

  // ── OpenAI ──

  it('Given LLM_BASE_URL contains openai.com, When detectProvider called, Then returns openai', () => {
    // Given: OpenAI base URL configured
    process.env.LLM_BASE_URL = 'https://api.openai.com/v1';

    // When: detecting
    const result = detectProvider();

    // Then: returns openai
    expect(result).toBe('openai');
  });

  // ── Priority: Gateway over OpenAI ──

  it('Given both Gateway and OpenAI configured, When detectProvider called, Then Gateway wins', () => {
    // Given: both are set
    process.env.OPENCLAW_GATEWAY_HOST = 'http://127.0.0.1:18789';
    process.env.LLM_BASE_URL = 'https://api.openai.com/v1';

    // When: detecting
    const result = detectProvider();

    // Then: Gateway takes priority over OpenAI
    expect(result).toBe('gateway');
  });

  // ── Sad path: non-openai base URL ──

  it('Given non-openai LLM_BASE_URL, When detectProvider called, Then falls back to deepseek', () => {
    // Given: a custom base URL that's not openai.com (sad path)
    process.env.LLM_BASE_URL = 'https://custom-llm.example.com/v1';

    // When: detecting
    const result = detectProvider();

    // Then: falls back to deepseek (not openai)
    expect(result).toBe('deepseek');
  });
});
