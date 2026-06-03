/**
 * orchestrator-adapter.test.ts — engine-core 适配器测试 (Slice 3.1, iron law 0-2 Step 2)
 *
 * 验证: DiagnosisLLMClient 正确包装 LLMProvider
 *       ToolExecutor 正确包装 ToolRegistry
 */
import { describe, it, expect } from 'vitest';
import { createDiagnosisLLMClient, createToolExecutorAdapter } from '../src/agent/orchestrator-adapter';
import type { LLMProvider, ChatResult } from '../src/providers/types';
import { ToolRegistry } from '../src/agent/tools';

// ═══ Fake Provider ═══

function fakeProvider(responseText = '诊断结果文本'): LLMProvider {
  return {
    name: 'fake-adapter',
    baseUrl: 'fake://test',
    async chat(_msgs, _opts): Promise<ChatResult> {
      return { content: responseText, model: 'fake' };
    },
    async stream(_msgs, cb) {
      for (const ch of responseText) cb.onToken(ch);
      cb.onComplete?.({ content: responseText, model: 'fake' });
    },
    async healthCheck() { return { healthy: true, latencyMs: 1 }; },
    listModels() { return ['fake']; },
  };
}

// ═══ Fake ToolRegistry ═══

function setupRegistry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register({
    name: 'query_team',
    description: '查询团队信息',
    parameters: {
      type: 'object',
      properties: { teamId: { type: 'string' } },
      required: ['teamId'],
    },
    handler: async (params) => ({
      teamId: params.teamId,
      name: '测试团队',
      members: 15,
    }),
  });
  r.register({
    name: 'failing_tool',
    description: '总是失败的工具',
    parameters: { type: 'object', properties: {} },
    handler: async () => { throw new Error('模拟工具失败'); },
  });
  return r;
}

// ═══ Tests ═══

describe('createDiagnosisLLMClient', () => {
  it('Given LLMProvider, When consult called, Then returns LLMResponse', async () => {
    const client = createDiagnosisLLMClient(fakeProvider('诊断完成'));
    const resp = await client.consult('系统提示', '用户消息');
    expect(resp.content).toBe('诊断完成');
    expect(resp.model).toBe('fake');
  });

  it('Given LLMProvider, When consult called, Then provider receives system + user messages', async () => {
    let capturedMessages: any;
    const provider = fakeProvider();
    const origChat = provider.chat;
    provider.chat = async (msgs, opts) => {
      capturedMessages = msgs;
      return origChat(msgs, opts);
    };

    const client = createDiagnosisLLMClient(provider);
    await client.consult('你是诊断专家', '分析我的组织');

    expect(capturedMessages).toHaveLength(2);
    expect(capturedMessages[0].role).toBe('system');
    expect(capturedMessages[0].content).toBe('你是诊断专家');
    expect(capturedMessages[1].role).toBe('user');
    expect(capturedMessages[1].content).toBe('分析我的组织');
  });
});

describe('createToolExecutorAdapter', () => {
  const registry = setupRegistry();

  it('Given registered tool, When execute called with JSON input, Then returns tool result', async () => {
    const executor = createToolExecutorAdapter(registry);
    const result = await executor.execute('query_team', '{"teamId":"t1"}');
    const parsed = JSON.parse(result.content);
    expect(parsed.teamId).toBe('t1');
    expect(parsed.name).toBe('测试团队');
    expect(parsed.members).toBe(15);
  });

  it('Given non-existent tool, When execute, Then returns error content', async () => {
    const executor = createToolExecutorAdapter(registry);
    const result = await executor.execute('nonexistent', '{}');
    const parsed = JSON.parse(result.content);
    expect(parsed.error).toBeDefined();
  });

  it('Given tool that throws, When execute, Then returns error content (not throwing)', async () => {
    const executor = createToolExecutorAdapter(registry);
    const result = await executor.execute('failing_tool', '{}');
    const parsed = JSON.parse(result.content);
    expect(parsed.error).toContain('模拟工具失败');
  });

  it('Given invalid JSON input, When execute, Then uses empty params gracefully', async () => {
    const executor = createToolExecutorAdapter(registry);
    const result = await executor.execute('query_team', 'not-valid-json');
    const parsed = JSON.parse(result.content);
    // Should still return a result (using empty params).
    // query_team requires teamId, so it might fail, but shouldn't crash.
    expect(parsed).toBeDefined();
  });
});
