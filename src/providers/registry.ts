/**
 * providers/registry.ts — Provider 注册中心 + Failover Chain (Era 3.3)
 *
 * ProviderRegistry: 多 provider 注册 + 健康矩阵
 * ProviderChain: LLMProvider 包装器，auto-failover
 * detectProviderFromUrl: 根据 base URL 自动检测 provider 类型
 */
import type { LLMProvider, LLMMessage, ChatOptions, ChatResult, StreamCallback, HealthCheckResult } from './types';
import { createProvider, type ProviderType } from './index';
import { createLogger } from '../logger';

const log = createLogger('providers/registry');

// ═══ URL Detection ═══

export function detectProviderFromUrl(url: string): ProviderType {
  if (url.includes('deepseek.com')) return 'deepseek';
  if (url.includes('openai.com')) return 'openai';
  if (url.includes('127.0.0.1') || url.includes('localhost') || url.includes('18789')) return 'gateway';
  // Default: OpenAI-compatible
  return 'openai';
}

// ═══ ProviderChain ═══

export function createProviderChain(
  providers: LLMProvider[],
): LLMProvider & { healthCheck(): Promise<HealthCheckResult[]> } {
  if (providers.length === 0) throw new Error('ProviderChain 至少需要一个 provider');

  return {
    name: `chain(${providers.map(p => p.name).join('→')})`,
    baseUrl: providers[0].baseUrl,

    async chat(messages: LLMMessage[], opts?: ChatOptions): Promise<ChatResult> {
      const errors: string[] = [];
      for (const p of providers) {
        try {
          log.info({ provider: p.name }, '尝试调用');
          const result = await p.chat(messages, opts);
          log.info({ provider: p.name }, '调用成功');
          return result;
        } catch (err: any) {
          log.warn({ provider: p.name, err: err.message }, 'Provider 失败，尝试下一个');
          errors.push(`${p.name}: ${err.message}`);
        }
      }
      throw new Error(`所有 Provider 均失败:\n${errors.map(e => `  - ${e}`).join('\n')}`);
    },

    async stream(messages: LLMMessage[], cb: StreamCallback, opts?: ChatOptions): Promise<void> {
      const errors: string[] = [];
      for (const p of providers) {
        try {
          let completed = false;
          await p.stream(messages, {
            onToken: cb.onToken,
            onComplete: (r) => { completed = true; cb.onComplete?.(r); },
            onError: () => {}, // 忽略单 provider 错误，尝试下一个
          }, opts);
          if (completed) return;
        } catch (err: any) {
          errors.push(`${p.name}: ${err.message}`);
        }
      }
      cb.onError?.(new Error(`所有 Provider 均失败:\n${errors.map(e => `  - ${e}`).join('\n')}`));
    },

    async healthCheck(): Promise<HealthCheckResult[]> {
      const results = await Promise.all(providers.map(async p => {
        const r = await p.healthCheck();
        return { ...r };
      }));
      return results;
    },

    listModels(): string[] {
      return [...new Set(providers.flatMap(p => p.listModels()))];
    },
  };
}

// ═══ ProviderRegistry ═══

export interface HealthMatrix {
  [providerName: string]: HealthCheckResult;
}

export class ProviderRegistry {
  private providers = new Map<string, LLMProvider>();

  register(name: string, provider: LLMProvider): void {
    this.providers.set(name, provider);
    log.info({ name }, 'Provider 已注册');
  }

  get(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }

  listProviders(): string[] {
    return [...this.providers.keys()];
  }

  async healthMatrix(): Promise<HealthMatrix> {
    const matrix: HealthMatrix = {};
    const entries = [...this.providers.entries()];
    const results = await Promise.all(
      entries.map(async ([name, p]) => {
        const r = await p.healthCheck();
        return { name, ...r };
      }),
    );
    for (const r of results) {
      matrix[r.name] = { healthy: r.healthy, latencyMs: r.latencyMs, error: r.error };
    }
    return matrix;
  }

  /** 返回第一个健康的 provider，全不健康返回 null */
  async getHealthyProvider(): Promise<LLMProvider | null> {
    for (const [name, p] of this.providers) {
      const h = await p.healthCheck();
      if (h.healthy) {
        log.info({ name }, '选中健康 provider');
        return p;
      }
    }
    log.error('无健康 provider');
    return null;
  }

  /** 构建 failover chain（健康优先排序） */
  async buildChain(): Promise<LLMProvider> {
    const healthy: LLMProvider[] = [];
    const unhealthy: LLMProvider[] = [];
    for (const [, p] of this.providers) {
      const h = await p.healthCheck();
      (h.healthy ? healthy : unhealthy).push(p);
    }
    const all = [...healthy, ...unhealthy];
    if (all.length === 0) throw new Error('未注册任何 Provider');
    return createProviderChain(all);
  }
}
