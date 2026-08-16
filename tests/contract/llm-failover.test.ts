/**
 * tests/contract/llm-failover.test.ts — D363 LLM 运行时 failover 接线测试
 *
 * 契约（铁律 47/48）:
 *   输入: LLMProvider 主/备用 + EngineConfig.fallbackProvider
 *   输出: wrapProviderWithFailover → LLMProvider（chain 包装，healthCheck 聚合为单值）
 *         buildFallbackProvider → LLMProvider | null（凭据缺失）
 *   降级: 无备用/凭据缺失 → 返回原 provider（行为不变，log 显式记录）；
 *         全部 provider 失败 → 抛错（绝不静默，错误含全部失败名）
 *
 * 覆盖（dev doc §4）:
 *   主成功不切 / 主失败切备用 / 全失败抛错 / chain 名称含顺序 /
 *   stream 路径 failover / 故障注入（mock 抛错，P1 复现场景）
 *
 * 与 tests/provider-chain.test.ts 的分工: 该文件测 createProviderChain 原生行为，
 * 本文件测接线层（wrapProviderWithFailover 的 healthCheck 契约适配 + 生产路径注入）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { LLMProvider, LLMMessage, ChatResult, StreamCallback, HealthCheckResult } from '../../src/providers/types';
import {
  wrapProviderWithFailover,
  buildFallbackProvider,
  ConversationEngine,
} from '../../src/agent/conversation-engine';

// ═══ Mock provider 工厂（零网络，chat/stream/healthCheck 全部可 spy） ═══

interface FakeProvider extends LLMProvider {
  chat: ReturnType<typeof vi.fn>;
  stream: ReturnType<typeof vi.fn>;
  healthCheck: ReturnType<typeof vi.fn>;
}

function fakeProvider(name: string, fail = false): FakeProvider {
  // baseUrl 用真实端点 — detectProviderFromUrl 按 URL 判定 provider 类型
  const baseUrl = name === 'deepseek' ? 'https://api.deepseek.com/v1'
    : name === 'openai' ? 'https://api.openai.com/v1'
    : `fake://${name}`;
  return {
    name,
    baseUrl,
    chat: vi.fn(async (_messages?: LLMMessage[]): Promise<ChatResult> => {
      if (fail) throw new Error(`${name} chat failed`);
      return { content: `response from ${name}`, model: `${name}-model` };
    }),
    stream: vi.fn(async (_messages?: LLMMessage[], cb?: StreamCallback): Promise<void> => {
      if (fail) { cb?.onError?.(new Error(`${name} stream failed`)); return; }
      cb?.onToken(`token-from-${name}`);
      cb?.onComplete?.({ content: `stream response from ${name}`, model: `${name}-model` });
    }),
    healthCheck: vi.fn(async (): Promise<HealthCheckResult> => ({
      healthy: !fail, latencyMs: 5, error: fail ? `${name} down` : undefined,
    })),
    listModels: () => [`${name}-model`],
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

// ═══ wrapProviderWithFailover ═══

describe('wrapProviderWithFailover', () => {
  it('无备用（null/undefined）→ 返回原 provider 实例，零包装开销', () => {
    const solo = fakeProvider('deepseek');
    expect(wrapProviderWithFailover(solo, null)).toBe(solo);
    expect(wrapProviderWithFailover(solo, undefined)).toBe(solo);
  });

  it('chain 名称含切换顺序，baseUrl 继承主 provider', () => {
    const primary = fakeProvider('deepseek');
    const wrapped = wrapProviderWithFailover(primary, fakeProvider('openai'));
    expect(wrapped.name).toBe('chain(deepseek→openai)');
    expect(wrapped.baseUrl).toBe(primary.baseUrl);
  });

  it('主 provider 成功 → 不切换，备用 chat 不被调用', async () => {
    const primary = fakeProvider('deepseek');
    const fallback = fakeProvider('openai');
    const wrapped = wrapProviderWithFailover(primary, fallback);
    const result = await wrapped.chat([{ role: 'user', content: 'hi' }]);
    expect(result.content).toContain('deepseek');
    expect(primary.chat).toHaveBeenCalledTimes(1);
    expect(fallback.chat).not.toHaveBeenCalled();
  });

  it('主 provider 抛错 → 自动切换备用并返回成功（故障注入核心）', async () => {
    const primary = fakeProvider('deepseek', true);
    const fallback = fakeProvider('openai');
    const wrapped = wrapProviderWithFailover(primary, fallback);
    const result = await wrapped.chat([{ role: 'user', content: 'hi' }]);
    expect(result.content).toContain('openai');
    expect(primary.chat).toHaveBeenCalledTimes(1);
    expect(fallback.chat).toHaveBeenCalledTimes(1);
  });

  it('全部 provider 失败 → 抛错，错误信息含全部失败 provider 名（不静默）', async () => {
    const wrapped = wrapProviderWithFailover(fakeProvider('deepseek', true), fakeProvider('openai', true));
    await expect(wrapped.chat([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow(/所有 Provider 均失败/);
    await expect(wrapped.chat([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow(/deepseek: deepseek chat failed[\s\S]*openai: openai chat failed/);
  });

  it('healthCheck 契约适配: 聚合为单值（LLMProvider 契约），任一健康即视为链可用', async () => {
    // context-engine.ts:274 isLLMAvailable 依赖 result.healthy 单值契约 —
    // 裸 chain 返回数组会破坏该契约（修复前未接线，此适配是接线的必要组成）
    const wrapped = wrapProviderWithFailover(fakeProvider('deepseek', true), fakeProvider('openai'));
    const result = await wrapped.healthCheck();
    expect(Array.isArray(result)).toBe(false);
    expect(result.healthy).toBe(true); // 备用健康 → 链可用（failover 语义）
  });

  it('healthCheck 契约适配: 全部不健康 → healthy=false 且携带主 provider 错误', async () => {
    const wrapped = wrapProviderWithFailover(fakeProvider('deepseek', true), fakeProvider('openai', true));
    const result = await wrapped.healthCheck();
    expect(result.healthy).toBe(false);
    expect(result.error).toContain('deepseek down');
  });

  it('stream 路径 failover: 主 stream 失败（onError 未完成）→ 切备用完成', async () => {
    const primary = fakeProvider('deepseek', true);
    const fallback = fakeProvider('openai');
    const wrapped = wrapProviderWithFailover(primary, fallback);
    const tokens: string[] = [];
    const completed = vi.fn();
    const errored = vi.fn();
    await wrapped.stream([{ role: 'user', content: 'hi' }], {
      onToken: (t) => { tokens.push(t); },
      onComplete: completed,
      onError: errored,
    });
    expect(tokens).toContain('token-from-openai');
    expect(completed).toHaveBeenCalledTimes(1);
    expect(completed).toHaveBeenCalledWith(expect.objectContaining({ content: 'stream response from openai' }));
    expect(errored).not.toHaveBeenCalled();
  });

  it('stream 路径全失败 → onError 收到"所有 Provider 均失败"', async () => {
    const wrapped = wrapProviderWithFailover(fakeProvider('deepseek', true), fakeProvider('openai', true));
    const errored = vi.fn();
    await wrapped.stream([{ role: 'user', content: 'hi' }], { onToken: () => {}, onError: errored });
    expect(errored).toHaveBeenCalledTimes(1);
    expect(String((errored.mock.calls[0] as Error[])[0]?.message)).toContain('所有 Provider 均失败');
  });
});

// ═══ buildFallbackProvider（环境变量派生备用） ═══

describe('buildFallbackProvider', () => {
  it('主 deepseek + OPENAI_API_KEY → 备用 openai', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-openai');
    const fallback = buildFallbackProvider(fakeProvider('deepseek'));
    expect(fallback?.name).toBe('openai');
  });

  it('主 deepseek + 无 OPENAI_API_KEY → null（凭据缺失显式降级）', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const fallback = buildFallbackProvider(fakeProvider('deepseek'));
    expect(fallback).toBeNull();
  });

  it('主非 deepseek（openai）+ DEEPSEEK_API_KEY → 备用 deepseek', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('DEEPSEEK_API_KEY', 'sk-test-deepseek');
    const fallback = buildFallbackProvider(fakeProvider('openai'));
    expect(fallback?.name).toBe('deepseek');
  });

  it('主非 deepseek + 无任何 deepseek 凭据 → null', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    vi.stubEnv('LLM_API_KEY', '');
    const fallback = buildFallbackProvider(fakeProvider('openai'));
    expect(fallback).toBeNull();
  });
});

// ═══ ConversationEngine 生产路径故障注入（P1 复现） ═══

describe('ConversationEngine 生产路径 failover（P1 复现）', () => {
  it('注入备用: 主 provider 抛错 → chain 自动切备用 → 用户无感知拿到回复（修复后核心行为）', async () => {
    const primary = fakeProvider('deepseek', true);
    const fallback = fakeProvider('openai');
    const engine = new ConversationEngine(primary, { fallbackProvider: fallback });
    const result = await engine.processMessage('你好');
    expect(result.reply).toContain('response from openai');
    expect(primary.chat).toHaveBeenCalled();
    expect(fallback.chat).toHaveBeenCalled();
  });

  it('显式禁用（fallbackProvider: null）→ 保持修复前行为: 主失败即抛，用户看到抱歉', async () => {
    const primary = fakeProvider('deepseek', true);
    const engine = new ConversationEngine(primary, { fallbackProvider: null });
    const result = await engine.processMessage('你好');
    expect(result.reply).toContain('抱歉，调用失败');
  });

  it('无备用凭据（环境变量为空）→ 单 provider 行为不变，不静默制造假备用', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    vi.stubEnv('LLM_API_KEY', '');
    const primary = fakeProvider('deepseek', true);
    const engine = new ConversationEngine(primary, {});
    const result = await engine.processMessage('你好');
    expect(result.reply).toContain('抱歉，调用失败');
  });

  it('主 provider 正常 → chain 路径零感知，回复来自主 provider', async () => {
    const primary = fakeProvider('deepseek');
    const engine = new ConversationEngine(primary, { fallbackProvider: fakeProvider('openai') });
    const result = await engine.processMessage('你好');
    expect(result.reply).toContain('response from deepseek');
  });
});
