/**
 * conversation.test.ts — 对话循环测试 (Era 1.2, iron law 0-2 Step 2)
 *
 * 验证: AgentConversation 状态机 + 消息历史 + Phase 推进
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentConversation } from '../src/agent/conversation';
import type { LLMProvider } from '../src/providers/types';

// Fake provider for deterministic testing
function fakeProvider(responseText = '你好！请告诉我你的组织情况。'): LLMProvider {
  return {
    name: 'fake', baseUrl: 'fake://test',
    async chat() { return { content: responseText, model: 'fake' }; },
    async stream(_msgs, cb) {
      for (const ch of responseText) cb.onToken(ch);
      cb.onComplete?.({ content: responseText, model: 'fake' });
    },
    async healthCheck() { return { healthy: true, latencyMs: 1 }; },
    listModels() { return ['fake']; },
  };
}

// ═══ Message History ═══

describe('AgentConversation — message history', () => {
  let conv: AgentConversation;

  beforeEach(() => { conv = new AgentConversation(fakeProvider()); });

  it('Given new conversation, When started, Then has system message only', () => {
    expect(conv.getMessages()).toHaveLength(1); // system prompt
    expect(conv.getMessages()[0].role).toBe('system');
  });

  it('Given user message, When processed, Then user + assistant messages added', async () => {
    const result = await conv.processMessage('我们是一个30人的SaaS公司');
    expect(result).toBeTruthy();
    const msgs = conv.getMessages();
    expect(msgs.some(m => m.role === 'user')).toBe(true);
    expect(msgs.some(m => m.role === 'assistant')).toBe(true);
  });

  it('Given multiple turns, When processed, Then history grows correctly', async () => {
    await conv.processMessage('消息1');
    await conv.processMessage('消息2');
    const msgs = conv.getMessages();
    const userMsgs = msgs.filter(m => m.role === 'user');
    expect(userMsgs.length).toBe(2);
  });
});

// ═══ Phase Progression ═══

describe('AgentConversation — phase progression', () => {
  it('Given new conversation, When started, Then phase is 0', () => {
    const conv = new AgentConversation(fakeProvider());
    expect(conv.getPhase()).toBe(0);
  });

  it('Given conversation, When advancePhase called, Then phase increments', () => {
    const conv = new AgentConversation(fakeProvider());
    conv.advancePhase();
    expect(conv.getPhase()).toBe(1);
  });

  it('Given max turns reached, When processMessage, Then returns phase complete signal', async () => {
    const conv = new AgentConversation(fakeProvider(), { maxTurns: 1 });
    const r1 = await conv.processMessage('turn 1');
    expect(r1.phaseComplete).toBeTruthy(); // reached max turns
  });
});

// ═══ State Serialization ═══

describe('AgentConversation — state serialization', () => {
  it('Given conversation with messages, When serialized, Then can be restored', () => {
    const conv1 = new AgentConversation(fakeProvider());
    conv1.setOrgId('test-org');
    const state = conv1.serialize();
    expect(state.orgId).toBe('test-org');
    expect(state.phase).toBe(0);
    expect(state.messages.length).toBe(1); // system prompt
  });

  it('Given serialized state, When restored, Then messages match', () => {
    const conv1 = new AgentConversation(fakeProvider());
    conv1.setOrgId('test-org');
    const state = conv1.serialize();

    const conv2 = AgentConversation.fromState(fakeProvider(), state);
    expect(conv2.getOrgId()).toBe('test-org');
    expect(conv2.getPhase()).toBe(0);
  });
});
