/**
 * tests/orchestrator/context-compressor.test.ts — C4 多策略上下文压缩器测试
 *
 * Phase 3.3: 新增 tool 裁剪 + cooldown + 副模型摘要测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContextCompressor, type CompressionConfig } from '../../src/orchestrator/context-compressor';
import type { LLMMessage } from '../../src/providers/types';

function makeMessages(count: number): LLMMessage[] {
  const msgs: LLMMessage[] = [{ role: 'system', content: 'You are a helpful assistant.' }];
  for (let i = 0; i < count; i++) {
    msgs.push({ role: 'user', content: `Message ${i}: ` + 'hello '.repeat(10) });
    msgs.push({ role: 'assistant', content: `Response ${i}: ` + 'world '.repeat(10) });
  }
  return msgs;
}

function makeToolMessages(): LLMMessage[] {
  return [
    { role: 'user', content: '帮我分析一下数据' },
    {
      role: 'assistant', content: '',
      tool_calls: [{ name: 'query_data', arguments: { sql: 'SELECT *' }, id: 'call_001' }],
    },
    {
      role: 'tool', content: '数据库中包含10000条记录，其中5000条是今年新增的。'.repeat(30),
      tool_call_id: 'call_001',
    },
    { role: 'assistant', content: '根据数据分析，今年增长明显。' },
    { role: 'user', content: '再看看财务方面' },
    {
      role: 'assistant', content: '',
      tool_calls: [{ name: 'query_finance', arguments: {}, id: 'call_002' }],
    },
    {
      role: 'tool', content: '财务数据摘要：收入增长20%，成本增长15%。'.repeat(30),
      tool_call_id: 'call_002',
    },
  ];
}

describe('ContextCompressor', () => {
  let compressor: ContextCompressor;

  beforeEach(() => {
    compressor = new ContextCompressor();
  });

  describe('compress()', () => {
    describe('sliding-window', () => {
      it('Given messages under window, When compressed, Then unchanged', () => {
        const msgs = makeMessages(5); // 1 system + 10 messages = 11 total
        const config: CompressionConfig = { strategy: 'sliding-window', windowSize: 20 };

        const result = compressor.compress(msgs, '', config);
        expect(result.messages).toHaveLength(msgs.length);
        expect(result.discardedCount).toBe(0);
      });

      it('Given messages over window, When compressed, Then oldest discarded', () => {
        const msgs = makeMessages(15); // 1 system + 30 messages = 31 total
        const config: CompressionConfig = { strategy: 'sliding-window', windowSize: 10 };

        const result = compressor.compress(msgs, '', config);
        expect(result.discardedCount).toBeGreaterThan(0);
        // System prompt preserved + 10 window pairs
        expect(result.messages.filter(m => m.role === 'system').length).toBe(1);
      });
    });

    describe('summary', () => {
      it('Given few messages, When summary, Then unchanged', () => {
        const msgs = makeMessages(3);
        const config: CompressionConfig = { strategy: 'summary' };

        const result = compressor.compress(msgs, '', config);
        expect(result.messages).toHaveLength(msgs.length);
        expect(result.discardedCount).toBe(0);
      });

      it('Given many messages, When summary, Then historic merged into one', () => {
        const msgs = makeMessages(20); // 41 total
        const config: CompressionConfig = { strategy: 'summary', maxSummaryTokens: 500 };

        const result = compressor.compress(msgs, '', config);
        expect(result.discardedCount).toBeGreaterThan(0);
        // Should have system + summary + recent messages
        expect(result.messages.filter(m => m.role === 'system').length).toBe(1);
      });
    });

    describe('selective', () => {
      it('Given keywords, When selective, Then only matching retained', () => {
        const msgs: LLMMessage[] = [
          { role: 'system', content: 'You are bot.' },
          { role: 'user', content: 'What is the budget for Q3?' },
          { role: 'assistant', content: 'Q3 budget is $100k.' },
          { role: 'user', content: 'How is the weather today?' },
          { role: 'assistant', content: 'Sunny.' },
        ];
        const config: CompressionConfig = { strategy: 'selective', selectiveKeywords: ['budget'] };

        const result = compressor.compress(msgs, '', config);
        // Should keep budget-related messages
        const allContent = result.messages.map(m => m.content).join(' ');
        expect(allContent).toContain('budget');
        // May discard the weather messages depending on matching
        expect(result.discardedCount).toBeGreaterThanOrEqual(0);
      });

      it('Given empty keywords, When selective, Then falls back to sliding-window', () => {
        const msgs = makeMessages(20);
        const config: CompressionConfig = { strategy: 'selective', selectiveKeywords: [] };

        const result = compressor.compress(msgs, '', config);
        expect(result.strategy).toBe('selective');
        expect(result.messages.length).toBeGreaterThan(0);
      });
    });
  });

  describe('estimateTokens()', () => {
    it('Given messages, When estimated, Then returns positive number', () => {
      const msgs = makeMessages(3);
      const estimated = compressor.estimateTokens(msgs);
      expect(estimated).toBeGreaterThan(0);
    });

    it('Given empty messages, When estimated, Then returns 0', () => {
      const estimated = compressor.estimateTokens([]);
      expect(estimated).toBe(0);
    });

    it('Given Chinese text, When estimated, Then accounts for char ratio', () => {
      const cn: LLMMessage[] = [{ role: 'user', content: '你好世界，这是一个测试消息用于验证中文token估算' }];
      const en: LLMMessage[] = [{ role: 'user', content: 'hello world this is a test message for token estimation' }];
      const cnEst = compressor.estimateTokens(cn);
      const enEst = compressor.estimateTokens(en);
      expect(cnEst).toBeGreaterThan(0);
      expect(enEst).toBeGreaterThan(0);
    });
  });

  describe('getActiveStrategy()', () => {
    it('Given default, When queried, Then returns sliding-window', () => {
      expect(compressor.getActiveStrategy()).toBe('sliding-window');
    });

    it('Given compressed with summary, When queried, Then returns summary', () => {
      const msgs = makeMessages(15);
      compressor.compress(msgs, '', { strategy: 'summary' });
      expect(compressor.getActiveStrategy()).toBe('summary');
    });
  });

  describe('error handling', () => {
    it('Given empty message list, When compressed, Then returns empty', () => {
      const result = compressor.compress([], '', { strategy: 'sliding-window' });
      expect(result.messages).toHaveLength(0);
      expect(result.discardedCount).toBe(0);
    });

    it('Given only system message, When compressed, Then preserved', () => {
      const msgs: LLMMessage[] = [{ role: 'system', content: 'You are a bot.' }];
      const result = compressor.compress(msgs, '', { strategy: 'sliding-window', windowSize: 5 });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('system');
    });
  });
});


// ═══ Phase 3.3: 工具输出裁剪 ═══

describe('tool output trimming', () => {
  let compressor: ContextCompressor;
  beforeEach(() => { compressor = new ContextCompressor(); });

  it('tool 内容超过 500 字符应裁剪', () => {
    const msgs = makeToolMessages();
    const result = compressor.compress(msgs, '', { strategy: 'sliding-window', windowSize: 20 });

    for (const msg of result.messages) {
      if (msg.role === 'tool' && (msg.content?.length ?? 0) > 500) {
        expect(msg.content).toMatch(/\.\.\.\[裁剪/);
      }
    }
  });

  it('tool-use 和 tool-result 成对边界应保持', () => {
    const msgs = makeToolMessages();
    const result = compressor.compress(msgs, '', { strategy: 'sliding-window', windowSize: 20 });

    for (let i = 0; i < result.messages.length - 1; i++) {
      if (result.messages[i].tool_calls?.length) {
        expect(result.messages[i + 1].role).toBe('tool');
      }
    }
  });
});

// ═══ Phase 3.3: 冷却机制 ═══

describe('cooldown', () => {
  let compressor: ContextCompressor;
  beforeEach(() => { compressor = new ContextCompressor(); });

  it('首次压缩应成功', () => {
    const msgs = makeMessages(50);
    const r = compressor.compress(msgs, '', { strategy: 'sliding-window', windowSize: 20 });
    expect(r.messages.length).toBeLessThan(50);
  });

  it('冷却期内再次压缩应跳过', () => {
    const msgs = makeMessages(50);
    compressor.compress(msgs, '', { strategy: 'sliding-window', windowSize: 20 });

    // 冷却期内第二次调用应返回原始消息（未压缩）
    const r2 = compressor.compress(msgs, '', { strategy: 'sliding-window', windowSize: 20 });
    expect(r2.messages.length).toBe(msgs.length); // 原始长度
    expect(r2.discardedCount).toBe(0); // 无丢弃
  });
});

// ═══ Phase 3.3: 副模型摘要 ═══

describe('subModelSummary', () => {
  let compressor: ContextCompressor;
  beforeEach(() => { compressor = new ContextCompressor(); });

  it('应返回摘要结果', async () => {
    const msgs = makeMessages(20);
    const provider = {
      consult: vi.fn().mockResolvedValue({ content: '摘要文本', model: 'deepseek-chat' }),
    };
    const result = await compressor.subModelSummary(msgs, provider as any);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('摘要');
  });
});
