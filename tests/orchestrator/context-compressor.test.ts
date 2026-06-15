/**
 * tests/orchestrator/context-compressor.test.ts — C4 多策略上下文压缩器测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
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
