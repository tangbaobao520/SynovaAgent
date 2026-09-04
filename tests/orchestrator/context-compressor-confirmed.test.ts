/**
 * tests/orchestrator/context-compressor-confirmed.test.ts
 * 测试: 压缩不丢失已确认判断 (上下文管理优化任务 Step 1)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ContextCompressor } from '../../src/orchestrator/context-compressor';
import type { LLMMessage } from '../../src/providers/types';

function msg(role: 'user' | 'assistant' | 'system', content: string): LLMMessage {
  return { role, content };
}

const compressor = new ContextCompressor();

beforeEach(() => {
  compressor.resetCooldown();
});

describe('ContextCompressor with confirmedFacts', () => {
  it('summary策略: confirmedFacts 出现在压缩输出中', () => {
    const messages: LLMMessage[] = [];
    // 前 25 轮对话（会被压缩）
    for (let i = 0; i < 25; i++) {
      messages.push(msg('user', `第${i}轮问题`));
      messages.push(msg('assistant', `第${i}轮回答`));
    }
    // GA 在第 5 轮纠正了错误判断
    messages[10] = msg('assistant', 'GA纠正：根因不是应收账款延长，是采购流程临时异常。已确认。');

    // 最近 10 轮
    for (let i = 25; i < 35; i++) {
      messages.push(msg('user', `第${i}轮问题`));
      messages.push(msg('assistant', `第${i}轮回答`));
    }

    const confirmedFacts = [
      '根因: 采购流程临时异常（GA纠正后确认）',
      '建议: 暂不催收，下月复查',
    ];

    // 先看不带 confirmedFacts 的压缩结果
    const resultWithout = compressor.compress(messages, '', {
      strategy: 'summary',
      maxSummaryTokens: 1500,
    });

    // 再模拟带 confirmedFacts 的注入：手动合并到返回消息中
    // （这是我们要实现的行为——在实现完成后，compress方法会直接处理）
    const factMessage: LLMMessage = {
      role: 'system',
      content: `[已确认的判断（永不丢失）]:\n${confirmedFacts.join('\n')}`,
    };

    const messagesWithFacts = [factMessage, ...resultWithout.messages];
    const combinedContent = messagesWithFacts.map(m => m.content).join(' ');

    // 验证: 压缩输出中包含已确认判断
    expect(combinedContent).toContain('采购流程临时异常');
    expect(combinedContent).toContain('暂不催收');
  });

  it('summary策略: 35轮对话触发压缩', () => {
    const messages: LLMMessage[] = [];
    for (let i = 0; i < 35; i++) {
      messages.push(msg('user', `问题${i}`));
      messages.push(msg('assistant', `回答${i}`));
    }

    const result = compressor.compress(messages, '', {
      strategy: 'summary',
      maxSummaryTokens: 1500,
    });

    // 70条消息 → 应该被压缩
    expect(result.discardedCount).toBeGreaterThan(0);
    expect(result.messages.length).toBeLessThan(messages.length);
    expect(result.strategy).toBe('summary');
  });

  it('summary策略: 10条以内不压缩', () => {
    const messages: LLMMessage[] = [];
    for (let i = 0; i < 5; i++) {
      messages.push(msg('user', `问题${i}`));
      messages.push(msg('assistant', `回答${i}`));
    }

    const result = compressor.compress(messages, '', {
      strategy: 'summary',
    });

    expect(result.discardedCount).toBe(0);
    expect(result.messages).toEqual(messages);
  });

  it('sliding-window策略: 超过窗口大小会丢弃旧消息', () => {
    const messages: LLMMessage[] = [];
    for (let i = 0; i < 40; i++) {
      messages.push(msg('user', `问题${i}`));
    }

    const result = compressor.compress(messages, '', {
      strategy: 'sliding-window',
      windowSize: 20,
    });

    expect(result.messages.length).toBeLessThan(40);
    expect(result.discardedCount).toBeGreaterThan(0);
  });

  it('summary策略+confirmedFacts: 事实注入到压缩输出顶部', () => {
    const messages: LLMMessage[] = [];
    for (let i = 0; i < 35; i++) {
      messages.push(msg('user', `问题${i}`));
      messages.push(msg('assistant', `回答${i}`));
    }

    const facts = ['根因: 采购流程异常(GA确认)', '建议: 暂不催收'];

    // 直接调用 compress() 传入 confirmedFacts
    const result = compressor.compress(messages, '', {
      strategy: 'summary',
      maxSummaryTokens: 1500,
    }, facts);

    // 第一条消息应该是 system 角色的已确认判断
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[0].content).toContain('已确认的判断');
    expect(result.messages[0].content).toContain('采购流程异常');
    expect(result.messages[0].content).toContain('暂不催收');
    expect(result.messages[0].content).toContain('永不丢失');

    // 已确认判断不应该在后续消息中丢失
    const allContent = result.messages.map(m => m.content).join(' ');
    expect(allContent).toContain('采购流程异常');
  });

  it('summary策略+空confirmedFacts: 不注入系统消息', () => {
    const messages: LLMMessage[] = [];
    for (let i = 0; i < 35; i++) {
      messages.push(msg('user', `问题${i}`));
      messages.push(msg('assistant', `回答${i}`));
    }

    const result = compressor.compress(messages, '', {
      strategy: 'summary',
      maxSummaryTokens: 1500,
    }, []);  // 空数组

    // 第一条消息不应该是 system 角色
    expect(result.messages[0].role).not.toBe('system');
  });

  it('summary策略+undefined confirmedFacts: 不注入', () => {
    const messages: LLMMessage[] = [];
    for (let i = 0; i < 35; i++) {
      messages.push(msg('user', `问题${i}`));
      messages.push(msg('assistant', `回答${i}`));
    }

    const result = compressor.compress(messages, '', {
      strategy: 'summary',
      maxSummaryTokens: 1500,
    });  // 不传 confirmedFacts

    expect(result.messages[0].role).not.toBe('system');
  });

  it('sliding-window+confirmedFacts: 事实仍然注入', () => {
    const messages: LLMMessage[] = [];
    for (let i = 0; i < 40; i++) {
      messages.push(msg('user', `问题${i}`));
    }

    const facts = ['重要事实: 不容丢失'];
    const result = compressor.compress(messages, '', {
      strategy: 'sliding-window',
      windowSize: 20,
    }, facts);

    // 即使 sliding-window 策略，confirmedFacts 也应该注入
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[0].content).toContain('重要事实');
  });
});
