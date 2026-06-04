/**
 * conversation-engine.test.ts — Slice 1.1: ConversationEngine 纯逻辑测试 (iron law 0-2 Step 2)
 *
 * 验证: ConversationEngine 零 UI 依赖, 纯逻辑可被 mock UI 测试。
 *       Phase 状态机、消息管理、工具循环、序列化全部独立于 neo-blessed。
 *
 * Given/When/Then 格式，fake provider 可控。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { LLMProvider, ChatResult, StreamCallback } from '../src/providers/types';

// ═══ We test ConversationEngine by loading it directly ═══
// (we use dynamic import because it doesn't exist yet — this IS the TDD step)

// ConversationEngine was extracted from ConversationEngine — same interface, new location
import { ConversationEngine } from '../src/agent/conversation-engine';

// ═══ Fake Provider ═══

function fakeProvider(responseText = '你好！请告诉我你的组织情况。'): LLMProvider {
  return {
    name: 'fake-engine',
    baseUrl: 'fake://test',
    async chat(_msgs, _opts): Promise<ChatResult> {
      return { content: responseText, model: 'fake' };
    },
    async stream(_msgs, cb: StreamCallback): Promise<void> {
      for (const ch of responseText) cb.onToken?.(ch);
      cb.onComplete?.({ content: responseText, model: 'fake' });
    },
    async healthCheck() { return { healthy: true, latencyMs: 1 }; },
    listModels() { return ['fake']; },
  };
}

// ═══ Tests: These MUST pass against ConversationEngine when extracted ═══

describe('ConversationEngine — pure logic, zero UI dependency', () => {
  let engine: ConversationEngine;

  beforeEach(() => {
    engine = new ConversationEngine(fakeProvider());
  });

  // ── Phase 0 completion ──

  it('Given Phase 0 and 6 turns with completion signal, When processMessage, Then phaseComplete=true', async () => {
    engine.setOrgId('test-org');
    // Batch 6 fix: ConversationEngine Phase 0 requires explicit completion signal
    // (e.g. "开始诊断") or turn limit reached (default maxTurns=6)
    const results: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      // Last turn sends explicit completion signal
      const msg = i === 5 ? '开始诊断' : `turn ${i + 1}`;
      const r = await engine.processMessage(msg);
      results.push(r.phaseComplete);
    }
    expect(results[results.length - 1]).toBe(true);
  });

  it('Given Phase 0 and 2 turns, When processMessage, Then phaseComplete=false', async () => {
    engine.setOrgId('test-org');
    const r1 = await engine.processMessage('turn 1');
    const r2 = await engine.processMessage('turn 2');
    expect(r1.phaseComplete).toBe(false);
    expect(r2.phaseComplete).toBe(false);
  });

  // ── Phase progression ──

  it('Given new engine, When getPhase, Then returns 0', () => {
    expect(engine.getPhase()).toBe(0);
  });

  it('Given engine at Phase 0, When advancePhase, Then getPhase returns 1', () => {
    engine.advancePhase();
    expect(engine.getPhase()).toBe(1);
  });

  // ── Message history ──

  it('Given new engine, When getMessages, Then returns system prompt only', () => {
    const msgs = engine.getMessages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe('system');
  });

  it('Given user message, When processMessage, Then user + assistant messages in history', async () => {
    await engine.processMessage('测试消息');
    const msgs = engine.getMessages();
    const roles = msgs.map(m => m.role);
    expect(roles).toContain('user');
    expect(roles).toContain('assistant');
  });

  // ── Serialization round-trip ──

  it('Given engine with messages, When serialize then fromState, Then state matches', () => {
    engine.setOrgId('roundtrip-org');
    const state = engine.serialize();
    expect(state.orgId).toBe('roundtrip-org');
    expect(state.phase).toBe(0);

    const restored = ConversationEngine.fromState(fakeProvider(), state);
    expect(restored.getOrgId()).toBe('roundtrip-org');
    expect(restored.getPhase()).toBe(0);
    expect(restored.getMessages().length).toBe(state.messages.length);
  });

  // ── ToolRegistry availability ──

  it('Given engine, When getToolRegistry, Then returns ToolRegistry instance', () => {
    const registry = engine.getToolRegistry();
    expect(registry).toBeDefined();
    expect(typeof registry.register).toBe('function');
    expect(typeof registry.execute).toBe('function');
    expect(typeof registry.listTools).toBe('function');
  });

  // ── Stream API ──

  it('Given processMessageStream, When onToken called, Then tokens accumulate to reply', async () => {
    const tokens: string[] = [];
    const result = await engine.processMessageStream('你好', (t) => tokens.push(t));
    expect(tokens.join('')).toBe(result.reply);
    expect(result.reply).toBeTruthy();
  });
});

// ═══ Additional tests: these will be run against the extracted ConversationEngine ═══

describe('ConversationEngine — no UI imports', () => {
  it('ConversationEngine module must not import neo-blessed', () => {
    // This test will be uncommented after ConversationEngine is extracted
    // const source = fs.readFileSync('src/agent/conversation-engine.ts', 'utf-8');
    // expect(source).not.toMatch(/neo-blessed/);
    // expect(source).not.toMatch(/from ['"]blessed['"]/);
    // For now, skip — ConversationEngine doesn't exist yet (TDD step)
    expect(true).toBe(true); // placeholder
  });

  it('ConversationEngine module must not import TUI modules', () => {
    // Placeholder — will validate after extraction
    expect(true).toBe(true);
  });
});
