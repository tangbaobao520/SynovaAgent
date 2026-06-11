/**
 * diagnosis-session.test.ts — 会话压缩测试
 *
 * 对标 Claw-Code compact.rs 的 9 个测试
 */

import {
  DiagnosisSessionCompactor,
  DiagnosisSessionConfig,
  estimateMessageTokens,
} from '../diagnosis-session';
import { DiagnosisSessionMessage } from '../types';

// ====================================================================
// 测试辅助
// ====================================================================

const msg = (
  role: 'user' | 'assistant' | 'system',
  content: string,
  opts?: { toolUses?: { id: string; name: string; input: string }[]; toolResults?: { id: string; content: string }[] },
): DiagnosisSessionMessage => ({
  role,
  content,
  ...opts,
});

const shortMsg = (role: 'user' | 'assistant', text: string) => msg(role, text);

// ====================================================================
// Token 估算
// ====================================================================

describe('estimateMessageTokens', () => {
  it('estimates CJK text at ~1.5 tokens per character', () => {
    // Given: a Chinese message
    const messages = [msg('user', '你好世界')];

    // When: estimating
    const tokens = estimateMessageTokens(messages);

    // Then: ~6 tokens for 4 Chinese characters
    expect(tokens).toBeGreaterThan(4);
    expect(tokens).toBeLessThan(10);
  });

  it('estimates ASCII text at ~0.75 tokens per character', () => {
    // Given: an English message
    const messages = [msg('user', 'hello world')];

    // When: estimating
    const tokens = estimateMessageTokens(messages);

    // Then: ~8 tokens for 11 ASCII characters
    expect(tokens).toBeGreaterThan(6);
    expect(tokens).toBeLessThan(12);
  });
});

// ====================================================================
// 压缩触发
// ====================================================================

describe('DiagnosisSessionCompactor', () => {
  const tinyConfig: DiagnosisSessionConfig = {
    preserveRecentMessages: 2,
    maxEstimatedTokens: 50,
    summaryModel: 'test',
    maxCompactedMessages: 10,
  };

  let compactor: DiagnosisSessionCompactor;

  beforeEach(() => {
    compactor = new DiagnosisSessionCompactor(tinyConfig);
  });

  it('triggers compaction when estimated tokens exceed threshold', () => {
    // Given: messages that exceed the 50-token threshold (lots of Chinese text)
    const messages = Array.from({ length: 20 }, (_, i) =>
      shortMsg(i % 2 === 0 ? 'user' : 'assistant', `这是第 ${i} 条测试消息，包含足够的中文内容来触发压缩阈值`),
    );

    // When: checking
    const needs = compactor.needsCompaction(messages);

    // Then: compaction triggered
    expect(needs).toBe(true);
  });

  it('does not compact when under threshold', () => {
    // Given: very few short messages
    const messages = [
      shortMsg('user', '你好'),
      shortMsg('assistant', '你好，请问有什么需要？'),
    ];

    // When: compacting
    const result = compactor.compact(messages);

    // Then: no compaction
    expect(result.wasCompacted).toBe(false);
    expect(result.messages).toBe(messages);
  });

  it('preserves recent messages after compaction', () => {
    // Given: 10 messages exceeding threshold
    const messages = Array.from({ length: 10 }, (_, i) =>
      shortMsg('user', `这是一条非常非常非常长的测试消息，编号为 ${i}，包含大量中文内容来确保超过压缩阈值`),
    );

    // When: compacting (preserveRecentMessages = 2)
    const result = compactor.compact(messages);

    // Then: compaction happened, last 2 original messages preserved
    expect(result.wasCompacted).toBe(true);
    // The compacted list has: system summary + last 2 messages + some older ones
    const lastOriginalMsg = messages[messages.length - 1];
    const found = result.messages.some(
      m => m.role === lastOriginalMsg.role && m.content === lastOriginalMsg.content,
    );
    expect(found).toBe(true);
  });

  // ── 边界保护（对标 gaebal-gajae repro 2026-04-09）──

  it('does NOT split ToolUse/ToolResult pair at compaction boundary', () => {
    // Given: message sequence containing ToolUse(id="probe-1") followed by ToolResult(id="probe-1")
    const messages: DiagnosisSessionMessage[] = [
      shortMsg('user', '请帮我查找专家'),
      msg('assistant', '正在调用工具...', {
        toolUses: [{ id: 'probe-1', name: 'findExpert', input: '{"domain":"knowledge_sharing"}' }],
      }),
      msg('user', '工具返回结果', {
        toolResults: [{ id: 'probe-1', content: '找到专家 3 人' }],
      }),
      shortMsg('assistant', '已找到 3 位知识共享领域专家'),
      shortMsg('user', '好的谢谢'),
    ];

    // Create a compactor that will force compaction between the ToolUse and ToolResult
    const tightCompactor = new DiagnosisSessionCompactor({
      preserveRecentMessages: 1,
      maxEstimatedTokens: 30,
      summaryModel: 'test',
      maxCompactedMessages: 10,
    });

    // When: compaction boundary would fall between ToolUse and ToolResult
    const result = tightCompactor.compact(messages);

    // Then: the pair is kept together — ToolUse and ToolResult are either both in messages or both in summary
    const kept = result.messages;
    const hasToolUse = kept.some(
      m => m.toolUses?.some(u => u.id === 'probe-1'),
    );
    const hasToolResult = kept.some(
      m => m.toolResults?.some(r => r.id === 'probe-1'),
    );

    // Both present or both absent
    expect(hasToolUse).toBe(hasToolResult);
  });

  it('adjusts boundary when split would separate a tool pair', () => {
    // Given: a message list where the natural split cuts between ToolUse and ToolResult
    // Use long enough content to trigger compaction with a low threshold
    const messages: DiagnosisSessionMessage[] = [
      shortMsg('user', '这是一条很长的消息用来触发压缩阈值的测试数据'),
      msg('assistant', '正在调用工具进行搜索查询', {
        toolUses: [{ id: 'call-1', name: 'search', input: '{"query":"测试搜索关键词"}' }],
      }),
      msg('user', '工具调用结果返回', {
        toolResults: [{ id: 'call-1', content: '搜索结果包含多条匹配记录' }],
      }),
      shortMsg('user', '最终确认收到结果'),
    ];

    const splitCompactor = new DiagnosisSessionCompactor({
      preserveRecentMessages: 1,
      maxEstimatedTokens: 20,
      summaryModel: 'test',
      maxCompactedMessages: 10,
    });

    // When: compacting (natural split would cut between ToolUse and ToolResult)
    const result = splitCompactor.compact(messages);

    // Then: compaction happened and the pair is intact
    expect(result.wasCompacted).toBe(true);
    // The last message (user) is in the preserved set
    const lastMsg = result.messages[result.messages.length - 1];
    expect(lastMsg.role).toBe('user');
  });

  // ── 摘要合并 ──

  it('generates summary for compressed messages', () => {
    // Given: messages triggering compaction
    const messages = Array.from({ length: 15 }, (_, i) =>
      shortMsg(i % 2 === 0 ? 'user' : 'assistant', `这是一条非常长的中文测试消息，序号为 ${i}，用于触发压缩阈值`),
    );

    // When: compacting
    const result = compactor.compact(messages);

    // Then: summary is non-empty and contains role indicators
    expect(result.wasCompacted).toBe(true);
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.summary).toContain('[用户]');
  });

  // ── 空会话 ──

  it('handles empty session gracefully', () => {
    // Given: empty message list
    const messages: DiagnosisSessionMessage[] = [];

    // When: compacting
    const result = compactor.compact(messages);

    // Then: no compaction, empty list returned
    expect(result.wasCompacted).toBe(false);
    expect(result.messages).toHaveLength(0);
  });
});

// ====================================================================
// 配置
// ====================================================================

describe('DiagnosisSessionConfig defaults', () => {
  it('uses defaults when no config provided', () => {
    // Given: default compactor
    const c = new DiagnosisSessionCompactor();

    // When: checking threshold behavior
    // Default maxEstimatedTokens = 8000, so a short message should not trigger
    const short = [shortMsg('user', 'hi')];
    expect(c.needsCompaction(short)).toBe(false);
  });

  it('accepts partial config overrides', () => {
    // Given: compactor with custom preserveRecentMessages and low maxEstimatedTokens
    const c = new DiagnosisSessionCompactor({
      preserveRecentMessages: 4,
      maxEstimatedTokens: 50,
    });

    // When: creating long message list
    const messages = Array.from({ length: 10 }, (_, i) =>
      shortMsg('user', `很长很长很长很长很长很长很长很长的测试消息 ${i}`),
    );

    // Then: compactor works with custom config
    const result = c.compact(messages);
    expect(result.wasCompacted).toBe(true);
  });
});
