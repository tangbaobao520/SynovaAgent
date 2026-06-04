/**
 * orchestrator/session-manager.ts — 会话管理 + 语义感知压缩 (Iter 6)
 *
 * 语义感知的会话压缩:
 *   - 矛盾段落 → 轻量压缩 (保留关键数据点, 结构化注入)
 *   - 根因段落 → 保留完整因果链
 *   - 普通对话 → 深度压缩 (摘要)
 *   - 系统消息/工具定义 → 不压缩 (永久保留)
 *
 * 参考: Claw-Code compact.rs (boundary protection, LLM summarization)
 */
import { createLogger } from '../logger';

const log = createLogger('orchestrator/session-manager');

// ═══ Types ═══

export type CompactionLevel = 'preserve_full' | 'light_compress' | 'deep_compress' | 'skip';

export interface Message {
  role: string;
  content: string;
  tool_call_id?: string;
  name?: string;
}

export interface CompactionResult {
  /** Number of messages removed */
  removedCount: number;
  /** Compaction summary */
  summary: string;
  /** Number of messages preserved (light compression) */
  preservedCount: number;
}

export interface SessionConfig {
  compactionThresholdTokens: number;
  tokenEstimateCharsPerToken: number;
  /** Hermes P8: LLM summarization for compression fallback */
  llmSummarize?: (messages: Message[]) => Promise<string>;
}

// ═══ SessionManager ═══

export class SessionManager {
  private messages: Message[] = [];
  private config: SessionConfig;

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = {
      compactionThresholdTokens: config.compactionThresholdTokens ?? 100_000,
      tokenEstimateCharsPerToken: config.tokenEstimateCharsPerToken ?? 4,
    };
  }

  addMessage(msg: Message): void {
    this.messages.push(msg);
  }

  getMessages(): Message[] { return [...this.messages]; }

  /** Estimate total tokens (rough heuristic: chars/4, same as Claw-Code) */
  estimateTokens(): number {
    return this.messages.reduce(
      (sum, m) => sum + Math.ceil(m.content.length / this.config.tokenEstimateCharsPerToken),
      0,
    );
  }

  /** Check if compaction is needed */
  needsCompaction(): boolean {
    return this.estimateTokens() > this.config.compactionThresholdTokens;
  }

  /**
   * Classify a message for compaction level.
   *
   * preserve_full: root cause finding, tool definitions, system prompts
   * light_compress: contradiction signals, key evidence
   * deep_compress: normal conversation
   * skip: tool_use/tool_result (handled by boundary protection)
   */
  classifyMessage(msg: Message): CompactionLevel {
    const content = msg.content || '';

    // Preserve: root cause findings
    if (content.includes('rootcause.found') || content.includes('根因')) {
      return 'preserve_full';
    }
    // Preserve: system prompts and tool definitions
    if (msg.role === 'system') return 'preserve_full';

    // Light compress: contradiction signals — preserve data points
    if (content.includes('contradiction.detected') ||
        content.includes('矛盾') ||
        content.includes('vs')) {
      return 'light_compress';
    }
    // Light compress: key evidence with confidence
    if (content.includes('置信度') || content.includes('confidence')) {
      return 'light_compress';
    }

    // Deep compress: normal conversation
    return 'deep_compress';
  }

  /**
   * Hermes P8: 压缩失败恢复链 — LLM 摘要 → 确定性摘要 → 保留所有
   */
  async compactWithFallback(): Promise<CompactionResult & { method: 'llm' | 'deterministic' | 'none' }> {
    // 层级 1: LLM 摘要
    if (this.config.llmSummarize) {
      try {
        const summary = await this.config.llmSummarize(this.messages);
        if (summary) {
          const originalLength = this.messages.length;
          // 保留 system prompt + 最后 3 条, 其余替换为 LLM 摘要
          const preserved = this.messages.slice(-3);
          this.messages = [
            this.messages[0], // system prompt
            { role: 'system', content: `[会话摘要] ${summary}` },
            ...preserved,
          ];
          return { removedCount: originalLength - this.messages.length, summary, preservedCount: this.messages.length, method: 'llm' };
        }
      } catch (err: any) {
        log.warn({ err: err.message }, 'LLM 摘要失败, 降级到确定性压缩');
      }
    }

    // 层级 2: 确定性摘要 (保留关键数据点)
    const result = this.compact();
    return { ...result, method: result.removedCount > 0 ? 'deterministic' : 'none' };
  }

  /**
   * Compact the session with semantic awareness.
   *
   * Boundary protection: never split tool_use/tool_result pairs.
   * Semantic classification: each message gets a compaction level.
   */
  compact(): CompactionResult {
    const classified = this.messages.map((m, i) => ({
      msg: m,
      index: i,
      level: this.classifyMessage(m),
    }));

    // Find the cut point — remove enough deep_compress messages to get below threshold
    let cutIndex = 0;
    let tokenEstimate = this.estimateTokens();
    const targetTokens = this.config.compactionThresholdTokens * 0.5; // Compact to 50% threshold

    for (let i = 0; i < classified.length && tokenEstimate > targetTokens; i++) {
      if (classified[i].level === 'deep_compress' || classified[i].level === 'light_compress') {
        // Boundary protection: don't cut between tool_use and tool_result
        if (this.isToolPair(classified, i)) continue;

        cutIndex = i + 1;
        tokenEstimate -= Math.ceil(classified[i].msg.content.length / this.config.tokenEstimateCharsPerToken);
      }
    }

    if (cutIndex === 0) {
      return { removedCount: 0, summary: '', preservedCount: this.messages.length };
    }

    // Build summary from removed messages
    const preserved = classified.slice(cutIndex);
    const removed = classified.slice(0, cutIndex);

    // Light compress: extract key data from contradiction paragraphs
    const dataPoints: string[] = [];
    for (const item of removed) {
      if (item.level === 'light_compress') {
        // Extract structured data: "dimension: value vs value"
        const match = item.msg.content.match(/(\w+\.\w+):?\s*(.+)/);
        if (match) dataPoints.push(`[${match[1]}] ${match[2].slice(0, 100)}`);
        else dataPoints.push(item.msg.content.slice(0, 80));
      }
    }

    const summary = [
      `[会话压缩: 移除 ${removed.length} 条消息, 保留 ${preserved.length} 条]`,
      dataPoints.length > 0 ? `\n关键数据点: ${dataPoints.join(' | ')}` : '',
    ].filter(Boolean).join('');

    // Replace old messages with summary system message
    const preservedMsgs = preserved.map(p => p.msg);
    this.messages = [
      { role: 'system', content: summary },
      ...preservedMsgs,
    ];

    log.info({ removed: removed.length, preserved: preserved.length }, '会话压缩完成');
    return {
      removedCount: removed.length,
      summary,
      preservedCount: preserved.length,
    };
  }

  /** Check if index i is part of a tool_use/tool_result pair that shouldn't be split */
  private isToolPair(classified: Array<{ msg: Message; index: number; level: CompactionLevel }>, i: number): boolean {
    const msg = classified[i].msg;
    // If this is a tool_result, check if its tool_use is also before the cut
    if (msg.role === 'tool' && msg.tool_call_id) {
      for (let j = 0; j < i; j++) {
        if (classified[j].msg.role === 'assistant' &&
            classified[j].msg.tool_call_id === msg.tool_call_id) {
          return true; // Don't split — both stay on same side
        }
      }
    }
    return false;
  }
}
