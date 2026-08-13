/**
 * orchestrator/context-engine.ts — 上下文可插拔引擎 (Phase G1)
 *
 * 对标补全: 文件驱动压缩策略，LLM 不可用时自动降级到 truncate_oldest。
 *
 * ContextEngine 是 ContextCompressor 的上层包装。
 * 职责:
 *   1. 从 extensions/context-strategies/*.json 加载策略
 *   2. 根据策略 triggers 评估是否触发压缩
 *   3. 执行压缩（LLM 可用 → 智能摘要，LLM 不可用 → truncate_oldest）
 *   4. 追踪统计（totalCompressions / avgSavings / degradedCount）
 *
 * 接线点: conversation-engine.ts 每次 LLM 调用前调用 shouldCompress()
 *
 * 文件驱动: 新增策略 JSON → 构造函数自动加载（扫描扩展目录）
 * 降级: healthCheck 失败或 chat 异常 → truncate_oldest → degraded: true
 *
 * 铁律 24+31: 每步独立 try/catch, degraded 传播。
 * 铁律 38: 零不安全类型断言。
 * 铁律 39: L2 编排层。
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { createLogger } from '@synova/logger';
import { ContextCompressor, type CompressionConfig, type SummaryProvider } from './context-compressor';
import type { LLMMessage, LLMProvider } from '../providers/types';

const log = createLogger('orchestrator/context-engine');

// ═══ 类型定义 ═══

export interface ContextStrategy {
  $id: string;
  version: number;
  maxTokens: number;
  triggers: {
    tokenThreshold: number;
    messageCountThreshold: number;
  };
  retention: {
    keepSystemPrompt: boolean;
    keepLastNMessages: number;
    keepExpertConclusions: boolean;
    keepSentinelFindings: boolean;
  };
  fallback: {
    whenLLMUnavailable: 'truncate_oldest' | 'skip_compression';
    whenTimeout: 'skip_compression';
  };
}

export interface CompressStats {
  totalCompressions: number;
  avgSavings: number;
  degradedCount: number;
}

export interface CompressResult {
  messages: LLMMessage[];
  stats: {
    discardedCount: number;
    savingsPercent: number;
    degraded: boolean;
    strategy: string;
  };
}

export interface ContextEngineOptions {
  /** 策略列表（从 JSON 加载后的对象） */
  strategies?: ContextStrategy[];
  /** 策略目录路径（默认 extensions/context-strategies） */
  strategiesDir?: string;
  /** LLM Provider（用于健康检查和智能摘要） */
  provider?: LLMProvider;
}

// ═══ 硬编码默认值（兜底 — 无策略文件时使用） ═══

const FALLBACK_STRATEGY: ContextStrategy = {
  $id: 'built-in/default',
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

const DEFAULT_STRATEGIES_DIR = 'extensions/context-strategies';

// ═══ ContextEngine ═══

export class ContextEngine {
  private strategies: ContextStrategy[] = [];
  private activeStrategy: ContextStrategy = FALLBACK_STRATEGY;
  private provider?: LLMProvider;

  // 统计
  private totalCompressions = 0;
  private totalDiscarded = 0;
  private totalOriginal = 0;
  private degradedCount = 0;

  // 底层压缩器
  private compressor = new ContextCompressor();

  constructor(opts: ContextEngineOptions = {}) {
    if (opts.strategies !== undefined && opts.strategies !== null) {
      // 显式传入策略数组 — 使用传入的（即使是空数组也用内建默认）
      if (Array.isArray(opts.strategies) && opts.strategies.length > 0) {
        this.strategies = opts.strategies;
      } else {
        this.strategies = [FALLBACK_STRATEGY];
      }
    } else {
      // 未传入策略 — 从文件系统加载
      this.strategies = this.loadStrategiesFromDir(opts.strategiesDir);
    }
    if (this.strategies.length > 0) {
      this.activeStrategy = this.strategies[0];
    }
    this.provider = opts.provider;

    log.info({ strategyCount: this.strategies.length, activeStrategy: this.activeStrategy.$id }, 'ContextEngine 初始化完成');
  }

  // ═══ 公共接口 ═══

  /**
   * 判断是否需要压缩。
   * 根据策略的 triggers 评估：token 超阈值 或 消息数超阈值。
   * 等于阈值时 NOT 触发（避免频繁压缩）。
   */
  shouldCompress(messages: LLMMessage[], tokenCount: number): boolean {
    const { tokenThreshold, messageCountThreshold } = this.activeStrategy.triggers;

    if (tokenCount > tokenThreshold) {
      log.debug({ tokenCount, tokenThreshold }, 'token 超阈值 — 需要压缩');
      return true;
    }

    if (messages.length > messageCountThreshold) {
      log.debug({ messageCount: messages.length, messageCountThreshold }, '消息数超阈值 — 需要压缩');
      return true;
    }

    return false;
  }

  /**
   * 执行压缩。
   * LLM 可用 → 调用 ContextCompressor + LLM 摘要
   * LLM 不可用 → truncate_oldest → degraded: true
   */
  async compress(messages: LLMMessage[], tokenCount: number, confirmedFacts?: string[]): Promise<CompressResult> {
    if (messages.length === 0) {
      return {
        messages: [],
        stats: { discardedCount: 0, savingsPercent: 0, degraded: false, strategy: 'none' },
      };
    }

    // 只有 system prompt → 不压缩
    if (messages.length === 1 && messages[0].role === 'system') {
      return {
        messages,
        stats: { discardedCount: 0, savingsPercent: 0, degraded: false, strategy: 'none' },
      };
    }

    const originalLen = messages.length;

    try {
      // 检查 LLM 可用性
      const llmAvailable = await this.isLLMAvailable();

      if (llmAvailable) {
        return await this.compressWithLLM(messages, tokenCount, originalLen, confirmedFacts);
      }

      // LLM 不可用 → truncate_oldest 降级
      return this.compressDegraded(messages, originalLen);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, '压缩异常 — 降级到 truncate_oldest');
      return this.compressDegraded(messages, originalLen);
    }
  }

  /**
   * 获取压缩统计。
   */
  getStats(): CompressStats {
    const avgSavings = this.totalOriginal > 0
      ? Math.round((this.totalDiscarded / this.totalOriginal) * 100)
      : 0;

    return {
      totalCompressions: this.totalCompressions,
      avgSavings,
      degradedCount: this.degradedCount,
    };
  }

  /**
   * 获取当前策略。
   */
  getActiveStrategy(): ContextStrategy {
    return this.activeStrategy;
  }

  /**
   * 扫描目录加载所有策略。
   * 公开给测试和文件扩展验证。
   */
  loadStrategies(dir?: string): ContextStrategy[] {
    return this.loadStrategiesFromDir(dir);
  }

  // ═══ 策略加载 ═══

  private loadStrategiesFromDir(dir?: string): ContextStrategy[] {
    const searchDir = dir || resolve(process.cwd(), DEFAULT_STRATEGIES_DIR);
    const loaded: ContextStrategy[] = [];

    try {
      if (!existsSync(searchDir)) {
        log.warn({ dir: searchDir }, '策略目录不存在 — 使用内建默认值');
        return [FALLBACK_STRATEGY];
      }

      const files = readdirSync(searchDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const fullPath = join(searchDir, file);
          const content = readFileSync(fullPath, 'utf-8');
          const strategy = JSON.parse(content) as ContextStrategy;

          if (!strategy.$id || !strategy.triggers) {
            log.warn({ file }, '策略文件格式无效 — 跳过');
            continue;
          }

          loaded.push(strategy);
          log.debug({ file, $id: strategy.$id }, '策略已加载');
        } catch (parseErr) {
          const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          log.warn({ file, err: msg }, '策略文件解析失败 — 跳过');
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, '策略目录扫描异常 — 使用内建默认值');
    }

    if (loaded.length === 0) {
      log.warn('未找到有效策略 — 使用内建默认值');
      return [FALLBACK_STRATEGY];
    }

    return loaded;
  }

  // ═══ LLM 可用性检查 ═══

  private async isLLMAvailable(): Promise<boolean> {
    if (!this.provider) return false;

    try {
      const result = await this.provider.healthCheck();
      if (!result.healthy) {
        log.warn({ error: result.error }, 'LLM healthCheck 不健康 — 降级');
        return false;
      }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, 'LLM healthCheck 异常 — 降级');
      return false;
    }
  }

  // ═══ LLM 压缩 ═══

  private async compressWithLLM(
    messages: LLMMessage[],
    _tokenCount: number,
    originalLen: number,
    confirmedFacts?: string[],
  ): Promise<CompressResult> {
    try {
      // 使用 ContextCompressor 的 summary 策略 + 副模型摘要
      const config: CompressionConfig = {
        strategy: 'summary',
        maxSummaryTokens: 1500,
      };

      // 构造 SummaryProvider 包装（provider.chat 作为摘要模型）
      const summaryProvider: SummaryProvider = {
        consult: async (systemPrompt: string, userMessage: string) => {
          if (!this.provider) {
            return { content: '' };
          }
          const result = await this.provider.chat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ], { temperature: 0.3, maxTokens: 300 });
          return { content: result.content, model: result.model };
        },
      };

      const summaryText = await this.compressor.subModelSummary(messages, summaryProvider);
      const result = this.compressor.compress(messages, '', config, summaryText ? [summaryText] : confirmedFacts);

      this.totalCompressions++;
      this.totalDiscarded += result.discardedCount;
      this.totalOriginal += originalLen;

      const savingsPercent = originalLen > 0
        ? Math.round((result.discardedCount / originalLen) * 100)
        : 0;

      log.info({ before: originalLen, after: result.messages.length, discarded: result.discardedCount, savingsPercent }, 'LLM 压缩完成');
      return {
        messages: result.messages,
        stats: {
          discardedCount: result.discardedCount,
          savingsPercent,
          degraded: false,
          strategy: 'llm_summary',
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, 'LLM 压缩异常 — 降级到 truncate_oldest');
      return this.compressDegraded(messages, originalLen);
    }
  }

  // ═══ truncate_oldest 降级 ═══

  private compressDegraded(messages: LLMMessage[], originalLen: number): CompressResult {
    const { keepLastNMessages, keepSystemPrompt } = this.activeStrategy.retention;

    // 保留 system prompt + 最后 N 对消息
    const systemMsgs = keepSystemPrompt ? messages.filter(m => m.role === 'system') : [];
    const nonSystem = messages.filter(m => m.role !== 'system');
    const recent = nonSystem.slice(-(keepLastNMessages * 2)); // *2 for user+assistant pairs
    const discardedCount = originalLen - systemMsgs.length - recent.length;

    const result: LLMMessage[] = [...systemMsgs, ...recent];

    this.totalCompressions++;
    this.totalDiscarded += discardedCount;
    this.totalOriginal += originalLen;
    this.degradedCount++;

    const savingsPercent = originalLen > 0
      ? Math.round((discardedCount / originalLen) * 100)
      : 0;

    log.warn({
      before: originalLen,
      after: result.length,
      discarded: discardedCount,
      savingsPercent,
      degraded: true,
    }, '降级压缩完成 (truncate_oldest)');

    return {
      messages: result,
      stats: {
        discardedCount,
        savingsPercent,
        degraded: true,
        strategy: 'truncate_oldest',
      },
    };
  }
}
