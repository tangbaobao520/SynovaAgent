/**
 * providers/registry.ts — Provider 注册中心 + Failover Chain (Era 3.3)
 *
 * ProviderRegistry: 多 provider 注册 + 健康矩阵
 * ProviderChain: LLMProvider 包装器，auto-failover
 * detectProviderFromUrl: 根据 base URL 自动检测 provider 类型
 */
import type { LLMProvider, LLMMessage, ChatOptions, ChatResult, StreamCallback, HealthCheckResult } from './types';
import { createProvider, type ProviderType } from './index';
import { createLogger } from '@synova/logger';

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
): Omit<LLMProvider, 'healthCheck'> & { healthCheck(): Promise<HealthCheckResult[]> } {
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
          log.warn({ err: err instanceof Error ? err.message : String(err) }, "Provider 调用失败");
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
    return createProviderChain(all) as unknown as LLMProvider;
  }
}

// ═══ Phase 5.5: 凭据池轮换 ═══

export interface CredentialEntry {
  id: string;
  credentials: Record<string, string>;
}

export interface CredentialPoolConfig {
  /** 耗尽冷却时间（毫秒） */
  cooldownMs: number;
}

/**
 * 多 API Key 凭据池。
 * 401/429 自动标记当前 key exhausted 并轮换下一个。
 * 对标 Hermes credential_pool 模式。
 */
export class CredentialPool {
  private entries: CredentialEntry[] = [];
  private exhausted = new Map<string, number>(); // id → exhaustedAt
  private config: CredentialPoolConfig;

  constructor(config?: Partial<CredentialPoolConfig>) {
    this.config = { cooldownMs: config?.cooldownMs ?? 60_000 };
  }

  /** 注册一个凭据到池中 */
  register(id: string, credentials: Record<string, string>): void {
    this.entries.push({ id, credentials });
    log.debug({ id }, '凭据已注册到池');
  }

  /** 获取下一个可用凭据 */
  get(): CredentialEntry | null {
    const now = Date.now();

    // 先检查冷却到期的凭据
    for (const [id, exhaustedAt] of this.exhausted) {
      if (now - exhaustedAt >= this.config.cooldownMs) {
        this.exhausted.delete(id);
        log.info({ id, cooldownMs: this.config.cooldownMs }, '凭据冷却期满 — 恢复可用');
      }
    }

    // 找第一个未耗尽的
    for (const entry of this.entries) {
      if (!this.exhausted.has(entry.id)) {
        return entry;
      }
    }

    return null;
  }

  /** 标记凭据为耗尽（401/429 后调用） */
  markExhausted(id: string): void {
    this.exhausted.set(id, Date.now());
    const remaining = this.entries.filter(e => !this.exhausted.has(e.id)).length;
    log.warn({ id, remaining }, `凭据 ${id} 已耗尽 — 剩余 ${remaining} 个可用`);
  }

  /** 当前可用凭据数 */
  count(): number {
    return this.entries.length;
  }

  /** 所有凭据 */
  list(): CredentialEntry[] {
    return [...this.entries];
  }
}
