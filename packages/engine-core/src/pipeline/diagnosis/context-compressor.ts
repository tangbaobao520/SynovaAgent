/**
 * context-compressor.ts — 机械上下文压缩器
 *
 * B3: 对标 Claw-Code compact.rs 的纯文本机械压缩。
 * 不调 LLM。纯统计+截断+固顶。
 *
 * 核心原则（来自 Claw-Code 分析）：
 *   1. 零 LLM 调用 — 纯文本处理，统计+截断
 *   2. 严格有界 — 压缩后 = 1 条摘要 + N 条最近消息
 *   3. ToolUse/ToolResult 配对保护 — 绝不拆散工具调用对
 *   4. 重复压缩合并 — 旧摘要展平，避免摘要之摘要膨胀
 *
 * Synova 适配：
 *   - 诊断阶段消息替代对话消息
 *   - 证据条目替代文件操作
 *   - Phase 边界作为压缩触发点
 */

import { createLogger } from '../../infra/logger';

const log = createLogger('diagnosis/context-compressor');

// ====================================================================
// Types
// ====================================================================

export interface CompactionConfig {
  /** 保留最近 N 条消息（对标 Claw-Code preserve_recent_messages=4） */
  preserveRecentMessages: number;
  /** 触发压缩的估算 Token 阈值（对标 100_000） */
  maxEstimatedTokens: number;
  /** 每条消息截断字符数（对标 Claw-Code 160） */
  truncateChars: number;
  /** 摘要最大字符数 */
  maxSummaryChars: number;
}

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  preserveRecentMessages: 4,
  maxEstimatedTokens: 80_000, // 诊断上下文通常比对话小
  truncateChars: 200,
  maxSummaryChars: 3000,
};

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** 消息所属的诊断阶段（0-5） */
  phase?: number;
  /** 工具调用名（tool 角色时） */
  toolName?: string;
  /** 是否是工具调用结果 */
  isToolResult?: boolean;
  /** 是否是工具调用 */
  isToolUse?: boolean;
  /** 估算 Token 数 */
  estimatedTokens?: number;
}

export interface CompactionResult {
  /** 压缩后的消息列表 */
  compactedMessages: ConversationMessage[];
  /** 移除的消息数 */
  removedMessageCount: number;
  /** 压缩摘要 */
  summary: string;
  /** 节省的估算 Token 数 */
  tokensSaved: number;
  /** 压缩次数（用于检测重复压缩） */
  compactionCount: number;
}

// ====================================================================
// Token Estimation (对标 Claw-Code estimate_message_tokens: len/4+1)
// ====================================================================

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4) + 1;
}

function estimateMessageTokens(msg: ConversationMessage): number {
  return msg.estimatedTokens ?? estimateTokens(msg.content);
}

// ====================================================================
// Should Compact? (对标 Claw-Code should_compact)
// ====================================================================

export function shouldCompact(
  messages: ConversationMessage[],
  config: CompactionConfig = DEFAULT_COMPACTION_CONFIG,
): boolean {
  const compactable = messages.filter(m => m.role !== 'system'); // 跳过已有的摘要
  if (compactable.length <= config.preserveRecentMessages) return false;

  const totalTokens = compactable.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
  return totalTokens >= config.maxEstimatedTokens;
}

// ====================================================================
// Mechanical Compaction (对标 Claw-Code compact_session)
// ====================================================================

let globalCompactionCount = 0;

export function compactMessages(
  messages: ConversationMessage[],
  previousSummary?: string,
  config: CompactionConfig = DEFAULT_COMPACTION_CONFIG,
): CompactionResult {
  globalCompactionCount++;
  const compactedPrefixLen = messages[0]?.role === 'system' ? 1 : 0;
  let keepFrom = Math.max(compactedPrefixLen, messages.length - config.preserveRecentMessages);

  // ── 边界保护：绝不拆散 ToolUse/ToolResult 对（对标 Claw-Code）──
  // 向前扫描，确保保留的第一条消息不是孤立的 tool_result
  for (let k = keepFrom; k > compactedPrefixLen && k < messages.length; k++) {
    const firstPreserved = messages[k];
    const isToolResult = firstPreserved.isToolResult || firstPreserved.role === 'tool';
    if (!isToolResult) break;

    // 检查前一条是否是 tool_use
    const preceding = messages[k - 1];
    const hasToolUse = preceding.isToolUse || preceding.role === 'assistant';
    if (hasToolUse) {
      keepFrom = Math.max(compactedPrefixLen, k - 1);
      break;
    }
    keepFrom = Math.max(compactedPrefixLen, k - 1);
  }

  const removedMessages = messages.slice(compactedPrefixLen, keepFrom);
  const preservedMessages = messages.slice(keepFrom);

  if (removedMessages.length === 0) {
    return {
      compactedMessages: messages,
      removedMessageCount: 0,
      summary: previousSummary || '',
      tokensSaved: 0,
      compactionCount: globalCompactionCount,
    };
  }

  // ── 生成机械摘要（对标 Claw-Code summarize_messages）──
  const summary = buildMechanicalSummary(removedMessages, previousSummary, config);

  // ── 构建压缩后的消息列表 ──
  const systemSummary: ConversationMessage = {
    role: 'system',
    content: summary,
    estimatedTokens: estimateTokens(summary),
  };

  const result = [systemSummary, ...preservedMessages];

  const tokensBefore = messages.reduce((s, m) => s + estimateMessageTokens(m), 0);
  const tokensAfter = result.reduce((s, m) => s + estimateMessageTokens(m), 0);

  log.info({
    removedCount: removedMessages.length,
    preservedCount: preservedMessages.length,
    tokensBefore,
    tokensAfter,
    tokensSaved: tokensBefore - tokensAfter,
    compactionCount: globalCompactionCount,
  }, '[compressor] 机械压缩完成');

  return {
    compactedMessages: result,
    removedMessageCount: removedMessages.length,
    summary,
    tokensSaved: tokensBefore - tokensAfter,
    compactionCount: globalCompactionCount,
  };
}

// ====================================================================
// Mechanical Summary Builder (对标 Claw-Code summarize_messages)
// ====================================================================

function buildMechanicalSummary(
  removed: ConversationMessage[],
  previousSummary?: string,
  config: CompactionConfig = DEFAULT_COMPACTION_CONFIG,
): string {
  const lines: string[] = [];

  // 合并旧摘要（对标 Claw-Code merge_compact_summaries——展平，不嵌套）
  if (previousSummary) {
    lines.push('## 之前的上下文摘要');
    lines.push(previousSummary.slice(0, config.maxSummaryChars / 2));
    lines.push('');
  }

  // ── 统计 ──
  const phaseCounts = new Map<number, number>();
  const toolNames = new Set<string>();
  let totalChars = 0;

  for (const msg of removed) {
    if (msg.phase !== undefined) {
      phaseCounts.set(msg.phase, (phaseCounts.get(msg.phase) || 0) + 1);
    }
    if (msg.toolName) toolNames.add(msg.toolName);
    totalChars += msg.content.length;
  }

  lines.push(`## 新压缩的上下文 (${removed.length} 条消息, ~${Math.round(totalChars / 4)} tokens)`);
  lines.push('');

  // ── 阶段分布 ──
  if (phaseCounts.size > 0) {
    const phaseSummary = [...phaseCounts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([p, c]) => `Phase ${p}: ${c} 条`)
      .join(', ');
    lines.push(`**阶段分布**: ${phaseSummary}`);
  }

  // ── 关键发现（提取高置信度证据的前 5 条）──
  const evidenceMessages = removed.filter(m =>
    m.content.includes('置信度') || m.content.includes('evidence') || m.content.includes('得分'),
  );
  if (evidenceMessages.length > 0) {
    lines.push('');
    lines.push('**关键发现**:');
    for (const msg of evidenceMessages.slice(0, 5)) {
      lines.push(`- ${truncate(msg.content, config.truncateChars)}`);
    }
  }

  // ── 使用的工具 ──
  if (toolNames.size > 0) {
    lines.push('');
    lines.push(`**涉及工具**: ${[...toolNames].slice(0, 8).join(', ')}`);
  }

  // ── 时间线（每条消息一行，截断）──
  lines.push('');
  lines.push('**消息时间线**:');
  for (const msg of removed) {
    const roleTag = msg.role === 'tool' ? `[tool:${msg.toolName || '?'}]` : `[${msg.role}]`;
    const phaseTag = msg.phase !== undefined ? `[P${msg.phase}]` : '';
    lines.push(`${roleTag}${phaseTag} ${truncate(msg.content, config.truncateChars)}`);
  }

  const fullSummary = lines.join('\n');
  return fullSummary.slice(0, config.maxSummaryChars);
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

/** 重置压缩计数（测试用） */
export function resetCompactionCount(): void {
  globalCompactionCount = 0;
}
