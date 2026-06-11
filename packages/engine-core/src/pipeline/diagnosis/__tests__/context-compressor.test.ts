/**
 * context-compressor.test.ts — 机械压缩测试
 */
import {
  compactMessages,
  shouldCompact,
  resetCompactionCount,
  type ConversationMessage,
} from '../context-compressor';

beforeEach(() => resetCompactionCount());

function makeMessages(count: number): ConversationMessage[] {
  const msgs: ConversationMessage[] = [];
  for (let i = 0; i < count; i++) {
    msgs.push({ role: 'user', content: `问题 ${i}`.repeat(50) });  // ~200 chars
    msgs.push({ role: 'assistant', content: `回答 ${i}`.repeat(100) }); // ~400 chars
  }
  return msgs;
}

describe('shouldCompact', () => {
  it('returns false for few messages', () => {
    expect(shouldCompact(makeMessages(2))).toBe(false);
  });

  it('returns true when token threshold exceeded', () => {
    const msgs = makeMessages(30);
    expect(shouldCompact(msgs, { preserveRecentMessages: 4, maxEstimatedTokens: 5000, truncateChars: 200, maxSummaryChars: 3000 })).toBe(true);
  });
});

describe('compactMessages', () => {
  it('removes middle messages and preserves recent', () => {
    const msgs = makeMessages(20); // 40 messages total
    const result = compactMessages(msgs);
    expect(result.removedMessageCount).toBeGreaterThan(0);
    expect(result.compactedMessages.length).toBeLessThan(msgs.length);
  });

  it('preserves system message as first entry', () => {
    const msgs = [
      { role: 'system' as const, content: '摘要' },
      ...makeMessages(20),
    ];
    const result = compactMessages(msgs);
    expect(result.compactedMessages[0].role).toBe('system');
  });

  it('does not split ToolUse/ToolResult pairs', () => {
    const msgs: ConversationMessage[] = [
      { role: 'user', content: '运行诊断' },
      { role: 'assistant', content: '调用工具', isToolUse: true },
      { role: 'tool', content: '结果', isToolResult: true, toolName: 'diagnose' },
      { role: 'assistant', content: '最终回答' },
    ];
    // repeat to create bulk
    const bulk: ConversationMessage[] = [];
    for (let i = 0; i < 10; i++) bulk.push(...msgs);

    const result = compactMessages(bulk, undefined, {
      preserveRecentMessages: 2, maxEstimatedTokens: 100, truncateChars: 200, maxSummaryChars: 3000,
    });

    // The tool_result should never be the first preserved message
    const preserved = result.compactedMessages.slice(1); // skip system summary
    const firstPreserved = preserved[0];
    expect(firstPreserved?.isToolResult).not.toBe(true);
  });

  it('generates summary with phase distribution and tools', () => {
    const msgs: ConversationMessage[] = [
      { role: 'user', content: 'Phase 0 开始', phase: 0 },
      { role: 'assistant', content: '界定范围完成', phase: 0 },
      { role: 'user', content: '运行模块', phase: 1 },
      { role: 'tool', content: '采集完成 置信度高', phase: 1, toolName: 'runModules' },
      { role: 'assistant', content: '证据池就绪', phase: 1 },
      { role: 'user', content: '生成假设', phase: 2 },
      { role: 'assistant', content: '假设1: 信息流断裂', phase: 2 },
      { role: 'user', content: '结束', phase: 5 },
      { role: 'assistant', content: '最终回答', phase: 5 },
    ];
    const result = compactMessages(msgs, undefined, {
      preserveRecentMessages: 2, maxEstimatedTokens: 50, truncateChars: 200, maxSummaryChars: 3000,
    });
    expect(result.summary).toContain('Phase');
    expect(result.summary).toContain('runModules');
  });
});
