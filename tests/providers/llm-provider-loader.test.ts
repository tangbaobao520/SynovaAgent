/**
 * tests/providers/llm-provider-loader.test.ts — V3.8 Batch 4
 */
import { describe, it, expect } from 'vitest';
import { loadLLMProviders, getLLMProvider } from '../../src/providers/llm-provider-loader';

describe('loadLLMProviders', () => {
  it('加载 >= 10 提供商', () => {
    const { providers, degraded } = loadLLMProviders();
    expect(degraded).toBe(false);
    expect(providers.length).toBeGreaterThanOrEqual(10);
  });
  it('deepseek 有 capabilities', () => {
    const ds = getLLMProvider('deepseek');
    expect(ds).not.toBeNull();
    expect(ds!.capabilities.functionCalling).toBe(true);
  });
  it('ernie 不支持 function calling', () => {
    const ernie = getLLMProvider('ernie');
    expect(ernie).not.toBeNull();
    expect(ernie!.capabilities.functionCalling).toBe(false);
  });
});
