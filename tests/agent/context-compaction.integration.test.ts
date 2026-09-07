/**
 * tests/agent/context-compaction.integration.test.ts — D594 集成: 压缩引擎 × ConversationEngine 真实路由
 *
 * 组2 门禁: 文件名含 context 的跨模块文件须有集成测试。
 * 覆盖两条真实链路（入口 → 引擎 → 结果可见）:
 *   1. 压力压缩: processMessage 多轮长会话 → 超阈值自动压缩（checkpoint 落地、system 保留、对话不阻断）
 *   2. 溢出恢复: provider 抛 CONTEXT_OVERFLOW → 强制压缩 → retry 成功（经构造器真实 provider 包装层）
 */
import { describe, it, expect } from 'vitest';
import type { LLMProvider, ChatResult, LLMMessage, ChatOptions } from '../../src/providers/types';
import { ConversationEngine } from '../../src/agent/conversation-engine';

/** 可计数假 provider — handle 按调用序号决定返回/抛出 */
function makeProvider(handle: (calls: number) => Promise<ChatResult>): { provider: LLMProvider; callCount: () => number } {
  let calls = 0;
  return {
    callCount: () => calls,
    provider: {
      name: 'fake',
      baseUrl: 'http://fake',
      chat: async (_messages: LLMMessage[], _options?: ChatOptions): Promise<ChatResult> => {
        calls += 1;
        return handle(calls);
      },
      stream: async () => {},
      listModels: () => [],
      healthCheck: async () => ({ healthy: true }),
    },
  };
}

/** 避开 detectPhaseComplete 关键词（'ok'/'好的' 等）——防 Phase 0 提前完成 */
const TURNS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];

describe('D594 集成: 上下文压缩 × ConversationEngine 真实路由', () => {
  it('压力压缩端到端 — 多轮长会话自动压缩，checkpoint 落地且对话不阻断', async () => {
    const { provider, callCount } = makeProvider(async () => ({ content: 'r', model: 'fake' }));
    // 探针: 读真实 system prompt token 数，闭式推导窗口——
    // threshold=0.8w > 压缩后总量 system+checkpoint+retain尾 ⟺ 0.64w > S+checkpoint+单条消息，+50 余量
    const probe = new ConversationEngine(provider, { fallbackProvider: null, maxTurns: 12 });
    const sysTokens = Math.ceil(probe.serialize().messages[0].content.length / 4);
    const contextWindowTokens = Math.ceil((sysTokens + 126) / 0.64) + 50;
    const engine = new ConversationEngine(provider, { contextWindowTokens, fallbackProvider: null, maxTurns: 12 });
    const systemContent = engine.serialize().messages[0].content;

    const replies: string[] = [];
    for (const turn of TURNS) {
      const r = await engine.processMessage('x'.repeat(400)); // 100 tokens/轮
      replies.push(r.reply);
    }
    const messages = engine.serialize().messages;

    // 对话全程不阻断——每轮都有非空回复
    expect(replies).toHaveLength(6);
    expect(replies.every(r => typeof r === 'string' && r.length > 0)).toBe(true);
    // LLM 真实被调用（每轮 ≥1 次主 chat，压缩摘要额外）
    expect(callCount()).toBeGreaterThanOrEqual(6);
    // 压缩真实落地——checkpoint 进入消息流
    expect(messages.some(m => m.content.includes('<compacted-summary>'))).toBe(true);
    // system 锚定原样保留 + 消息总数收缩（未压缩应为 1+6×2=13）
    expect(messages[0].content).toBe(systemContent);
    expect(messages.length).toBeLessThan(13);
  });

  it('溢出恢复端到端 — provider 抛 CONTEXT_OVERFLOW → 强制压缩 → retry 成功', async () => {
    const { provider, callCount } = makeProvider(async (calls) => {
      if (calls === 3) {
        const err = new Error('context length exceeded');
        Object.defineProperty(err, 'code', { value: 'CONTEXT_OVERFLOW', enumerable: false });
        throw err;
      }
      if (calls === 5) return { content: 'RECOVERED-PAYLOAD', model: 'fake' };
      return { content: 'R'.repeat(600), model: 'fake' }; // 150 tokens/回复 — 喂饱影子价
    });
    // 窗口远大于会话 → 压力压缩全程静默，溢出恢复路径独立可见
    const engine = new ConversationEngine(provider, { contextWindowTokens: 1_000_000, fallbackProvider: null, maxTurns: 12 });

    await engine.processMessage(TURNS[0]);
    await engine.processMessage(TURNS[1]);
    const result = await engine.processMessage(TURNS[2]);
    const messages = engine.serialize().messages;

    // 第 3 轮主 chat 溢出 → 强制压缩 → 重试成功返回恢复内容
    expect(result.reply).toBe('RECOVERED-PAYLOAD');
    // 调用记账: 主1 + 主2 + 主3(溢出) + 摘要4 + 重试5 = 恰 5 次
    expect(callCount()).toBe(5);
    // 恰一次强制压缩 checkpoint（窗口巨大 → 不可能是压力路径产生）
    expect(messages.filter(m => m.content.includes('<compacted-summary>'))).toHaveLength(1);
    // 压缩后结构: system + checkpoint + 最后一条 user + 本轮回复
    expect(messages).toHaveLength(4);
    expect(messages[2].content.startsWith(TURNS[2])).toBe(true);
    // 早期消息已被 shadow
    expect(messages.some(m => m.content === 'R'.repeat(600))).toBe(false);
  });
});
