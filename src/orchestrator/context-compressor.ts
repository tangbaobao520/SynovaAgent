/**
 * orchestrator/context-compressor.ts — 多策略上下文压缩器 (Era C4)
 *
 * 当前单一压缩策略撑不住长时间对话。实现 3 种可选策略。
 * 对标: OpenClaw context-compression.ts
 *
 * 铁律 39: L2 编排层 — 压缩对话历史，不操作 L4/L5。
 */

import type { LLMMessage } from '../providers/types';
import { createLogger } from '../logger';

const log = createLogger('orchestrator/context-compressor');

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

// ═══ ContextCompressor ═══

export class ContextCompressor {
  private activeStrategy: CompressionStrategy = 'sliding-window';

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
  ): CompressionResult {
    this.activeStrategy = config.strategy;
    const total = messages.length;
    let result: LLMMessage[];

    switch (config.strategy) {
      case 'sliding-window':
        result = this.compressSlidingWindow(messages, config.windowSize ?? Math.max(20, Math.floor(total * 0.6)));
        break;
      case 'summary':
        result = this.compressSummary(messages, config);
        break;
      case 'selective':
        result = this.compressSelective(messages, config.selectiveKeywords ?? []);
        break;
      default:
        result = messages;
    }

    return {
      messages: result,
      discardedCount: total - result.length,
      strategy: config.strategy,
      estimatedTokens: this.estimateTokens(result),
    };
  }

  /**
   * 估算消息列表的 token 数。
   * 粗略规则: 英文 1 token/4 chars, 中文 1 token/1.5 chars
   */
  estimateTokens(messages: LLMMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      // 每条消息开销: ~4 tokens for role + metadata
      total += 4;
      const content = msg.content || '';
      total += this.estimateStringTokens(content);
    }
    return total;
  }

  /** 获取当前策略的名称 */
  getActiveStrategy(): CompressionStrategy {
    return this.activeStrategy;
  }

  // ═══ Private Strategies ═══

  /**
   * 滑动窗口: 保留系统提示词 + 最近 N 条消息。
   */
  private compressSlidingWindow(messages: LLMMessage[], windowSize: number): LLMMessage[] {
    if (messages.length <= windowSize) return messages;

    // 分离 system prompt 和普通消息
    const systemMsgs = messages.filter(m => m.role === 'system');
    const otherMsgs = messages.filter(m => m.role !== 'system');

    // 保留最近的窗口
    const kept = otherMsgs.slice(-windowSize);

    log.debug({ original: messages.length, kept: systemMsgs.length + kept.length, windowSize }, '滑动窗口压缩');
    return [...systemMsgs, ...kept];
  }

  /**
   * Summary: 合并历史消息为一条 summary 消息。
   * 保留最近 1/3 的消息, 前面的合并为一条 user 消息。
   */
  private compressSummary(messages: LLMMessage[], config: CompressionConfig): LLMMessage[] {
    const total = messages.length;
    if (total <= 10) return messages; // 太短无需压缩

    const keepCount = Math.max(5, Math.floor(total / 3));
    const systemMsgs = messages.filter(m => m.role === 'system');

    // 保留最近的 keepCount 条
    const otherMsgs = messages.filter(m => m.role !== 'system');
    const recent = otherMsgs.slice(-keepCount);
    const historic = otherMsgs.slice(0, -keepCount);

    if (historic.length === 0) return messages;

    // 合并历史消息为一条 user 摘要
    const summaryContent = historic
      .filter(m => m.content)
      .slice(0, 50) // 最多 50 条摘要
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

  /**
   * Selective: 根据关键词保留匹配的消息，其余丢弃。
   */
  private compressSelective(messages: LLMMessage[], keywords: string[]): LLMMessage[] {
    if (keywords.length === 0) {
      // 有关键词的才过滤，无关键词时退化为滑动窗口
      return this.compressSlidingWindow(messages, 30);
    }

    const systemMsgs = messages.filter(m => m.role === 'system');
    const otherMsgs = messages.filter(m => m.role !== 'system');

    // 保留包含关键词的消息
    const kept = otherMsgs.filter(msg => {
      const content = msg.content?.toLowerCase() || '';
      return keywords.some(kw => content.includes(kw.toLowerCase()));
    });

    // 如果关键词过滤后全空了, 保留最近 10 条保底
    if (kept.length === 0) {
      const fallback = otherMsgs.slice(-10);
      log.warn({ keywords }, 'Selective 压缩无匹配, 使用最近 10 条保底');
      return [...systemMsgs, ...fallback];
    }

    log.debug({ original: messages.length, kept: systemMsgs.length + kept.length, keywords }, '选择型压缩');
    return [...systemMsgs, ...kept];
  }

  // ═══ Helpers ═══

  /**
   * 估算字符串的 token 数。
   * 粗略规则: 英文 1 token/4 chars, 中文 1 token/1.5 chars
   */
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

  /**
   * 按 token 数截断字符串。
   */
  private truncateByTokens(text: string, maxTokens: number): string {
    const tokens = this.estimateStringTokens(text);
    if (tokens <= maxTokens) return text;
    const ratio = maxTokens / tokens;
    const charLimit = Math.floor(text.length * ratio);
    return text.slice(0, charLimit) + `\n... [截断, 原始 ${tokens} tokens]`;
  }
}
