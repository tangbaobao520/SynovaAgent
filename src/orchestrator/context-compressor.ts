/**
 * orchestrator/context-compressor.ts — 多策略上下文压缩器 (Era C4)
 *
 * 当前单一压缩策略撑不住长时间对话。实现 3 种可选策略。
 * 对标: OpenClaw context-compression.ts
 *
 * Phase 3.3 新增:
 * - 工具输出裁剪 (tool content > 500 chars)
 * - 压缩失败冷却 600 秒
 * - 副模型摘要 (subModelSummary)
 * - 压缩统计 (lastCompressAt, compressCount)
 *
 * 铁律 39: L2 编排层 — 压缩对话历史，不操作 L4/L5。
 */
import type { LLMMessage } from '../providers/types';
import { createLogger } from '@synova/logger';

const log = createLogger('orchestrator/context-compressor');

/** tool 内容最大长度 */
const TOOL_CONTENT_MAX = 500;
/** 压缩冷却时间 (ms) */
const COOLDOWN_MS = 600_000;

// ═══ Types ═══

export type CompressionStrategy = 'sliding-window' | 'summary' | 'selective';

export interface CompressionConfig {
  strategy: CompressionStrategy;
  /** 滑动窗口: 保留最近 N 条消息 */
  windowSize?: number;
  /** summary: 压缩后保留的最大 token 数 */
  maxSummaryTokens?: number;
  /** selective: 保留的关键词列表 (匹配到的消息不压缩) */
  selectiveKeywords?: string[];
}

export interface CompressionResult {
  messages: LLMMessage[];
  discardedCount: number;
  strategy: CompressionStrategy;
  /** 压缩后 token 估算 */
  estimatedTokens: number;
}

/** LLM Provider 最小接口（副模型摘要用） */
export interface SummaryProvider {
  consult(systemPrompt: string, userMessage: string, opts?: { temperature?: number; maxTokens?: number }): Promise<{ content: string; model?: string }>;
}

// ═══ ContextCompressor ═══

export class ContextCompressor {
  private activeStrategy: CompressionStrategy = 'sliding-window';

  // Phase 3.3: 压缩统计
  /** 上次压缩时间戳（用于冷却） */
  private lastCompressAt: number = 0;
  /** 累计压缩次数 */
  private compressCount: number = 0;

  /**
   * 压缩消息列表。
   * @param messages — 完整消息历史
   * @param systemPrompt — system prompt (不参与压缩)
   * @param config — 压缩策略配置
   */
  compress(
    messages: LLMMessage[],
    _systemPrompt: string,
    config: CompressionConfig,
    confirmedFacts?: string[],
  ): CompressionResult {
    // Phase 3.3: 冷却检查
    const now = Date.now();
    if (this.lastCompressAt > 0 && now - this.lastCompressAt < COOLDOWN_MS) {
      log.debug({ lastCompressAt: new Date(this.lastCompressAt).toISOString() }, '压缩冷却中 — 跳过');
      return {
        messages,
        discardedCount: 0,
        strategy: config.strategy,
        estimatedTokens: this.estimateTokens(messages),
      };
    }

    this.activeStrategy = config.strategy;
    const total = messages.length;
    let result: LLMMessage[];

    // Phase 3.3: 先裁剪 tool 输出，再执行压缩策略
    const trimmed = this.trimToolOutput(messages);

    switch (config.strategy) {
      case 'sliding-window':
        result = this.compressSlidingWindow(trimmed, config.windowSize ?? Math.max(20, Math.floor(total * 0.6)));
        break;
      case 'summary':
        result = this.compressSummary(trimmed, config, confirmedFacts);
        break;
      case 'selective':
        result = this.compressSelective(trimmed, config.selectiveKeywords ?? []);
        break;
      default:
        result = trimmed;
    }

    // v3.3: 注入已确认判断到压缩输出顶部
    if (confirmedFacts && confirmedFacts.length > 0 && result.length > 0) {
      const factMsg: LLMMessage = {
        role: 'system',
        content: `[已确认的判断（永不丢失——来自企业事实层）]:\n${confirmedFacts.map(f => `- ${f}`).join('\n')}`,
      };
      result = [factMsg, ...result];
    }

    // Phase 3.3: 更新统计
    this.lastCompressAt = now;
    this.compressCount++;

    return {
      messages: result,
      discardedCount: total - result.length,
      strategy: config.strategy,
      estimatedTokens: this.estimateTokens(result),
    };
  }

  // ═══ Phase 3.3: 副模型摘要 ═══

  /**
   * 使用副模型（更便宜的 LLM）生成对话摘要。
   * @param messages - 需要摘要的消息列表
   * @param provider - LLM provider (如 deepseek-chat)
   * @returns 摘要文本
   */
  async subModelSummary(messages: LLMMessage[], provider: SummaryProvider): Promise<string> {
    const summaryInput = messages
      .filter(m => m.content)
      .slice(-30)
      .map(m => `[${m.role}]: ${m.content.slice(0, 300)}`)
      .join('\n');

    const systemPrompt = '你是对话摘要助手。请用中文总结以下对话的关键信息，保持简洁（不超过200字）。';
    try {
      const result = await provider.consult(systemPrompt, summaryInput, {
        temperature: 0.3,
        maxTokens: 300,
      });
      log.debug({ model: result.model }, '副模型摘要完成');
      return result.content.slice(0, 500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, '副模型摘要失败 — 降级返回空');
      return '';
    }
  }

  // ═══ Phase 3.3: 工具输出裁剪 ═══

  /**
   * 裁剪 tool 角色的内容到 TOOL_CONTENT_MAX 字符，
   * 保护 tool-use/tool-result 成对边界。
   */
  private trimToolOutput(messages: LLMMessage[]): LLMMessage[] {
    return messages.map(msg => {
      if (msg.role === 'tool' && msg.content && msg.content.length > TOOL_CONTENT_MAX) {
        return {
          ...msg,
          content: msg.content.slice(0, TOOL_CONTENT_MAX) + `\n...[裁剪, 原始 ${msg.content.length} 字符]`,
        };
      }
      return msg;
    });
  }

  // ═══ Public Accessors ═══

  estimateTokens(messages: LLMMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      total += 4;
      const content = msg.content || '';
      total += this.estimateStringTokens(content);
    }
    return total;
  }

  getActiveStrategy(): CompressionStrategy {
    return this.activeStrategy;
  }

  /** 获取压缩统计 */
  getCompressStats(): { lastCompressAt: number; compressCount: number } {
    return { lastCompressAt: this.lastCompressAt, compressCount: this.compressCount };
  }

  /** 重置冷却（测试用） */
  resetCooldown(): void {
    this.lastCompressAt = 0;
  }

  // ═══ Private Strategies ═══

  private compressSlidingWindow(messages: LLMMessage[], windowSize: number): LLMMessage[] {
    if (messages.length <= windowSize) return messages;
    const systemMsgs = messages.filter(m => m.role === 'system');
    const otherMsgs = messages.filter(m => m.role !== 'system');
    const kept = otherMsgs.slice(-windowSize);
    log.debug({ original: messages.length, kept: systemMsgs.length + kept.length, windowSize }, '滑动窗口压缩');
    return [...systemMsgs, ...kept];
  }

  private compressSummary(messages: LLMMessage[], config: CompressionConfig, _confirmedFacts?: string[]): LLMMessage[] {
    const total = messages.length;
    if (total <= 10) return messages;
    const keepCount = Math.max(5, Math.floor(total / 3));
    const systemMsgs = messages.filter(m => m.role === 'system');
    const otherMsgs = messages.filter(m => m.role !== 'system');
    const recent = otherMsgs.slice(-keepCount);
    const historic = otherMsgs.slice(0, -keepCount);
    if (historic.length === 0) return messages;

    const summaryContent = historic
      .filter(m => m.content)
      .slice(0, 50)
      .map(m => `[${m.role}]: ${m.content.slice(0, 200)}`)
      .join('\n');

    const maxTokens = config.maxSummaryTokens ?? 2000;
    const truncated = this.truncateByTokens(summaryContent, maxTokens);

    const summary: LLMMessage = {
      role: 'user',
      content: `[压缩的对话历史 — ${historic.length} 条消息]:\n${truncated}`,
    };

    log.debug({ original: total, kept: systemMsgs.length + 1 + recent.length, historic: historic.length }, '摘要压缩');
    return [...systemMsgs, summary, ...recent];
  }

  private compressSelective(messages: LLMMessage[], keywords: string[]): LLMMessage[] {
    if (keywords.length === 0) {
      return this.compressSlidingWindow(messages, 30);
    }
    const systemMsgs = messages.filter(m => m.role === 'system');
    const otherMsgs = messages.filter(m => m.role !== 'system');
    const kept = otherMsgs.filter(msg => {
      const content = msg.content?.toLowerCase() || '';
      return keywords.some(kw => content.includes(kw.toLowerCase()));
    });
    if (kept.length === 0) {
      const fallback = otherMsgs.slice(-10);
      log.warn({ keywords }, 'Selective 压缩无匹配, 使用最近 10 条保底');
      return [...systemMsgs, ...fallback];
    }
    log.debug({ original: messages.length, kept: systemMsgs.length + kept.length, keywords }, '选择型压缩');
    return [...systemMsgs, ...kept];
  }

  // ═══ Helpers ═══

  private estimateStringTokens(text: string): number {
    let chineseChars = 0;
    let otherChars = 0;
    for (const ch of text) {
      if (/[一-鿿㐀-䶿]/.test(ch)) {
        chineseChars++;
      } else {
        otherChars++;
      }
    }
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  private truncateByTokens(text: string, maxTokens: number): string {
    const tokens = this.estimateStringTokens(text);
    if (tokens <= maxTokens) return text;
    const ratio = maxTokens / tokens;
    const charLimit = Math.floor(text.length * ratio);
    return text.slice(0, charLimit) + `\n... [截断, 原始 ${tokens} tokens]`;
  }
}
