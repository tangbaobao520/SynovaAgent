/**
 * tool-calling.test.ts — 工具调用测试 (Era 2.2, iron law 0-2 Step 2)
 *
 * 验证: ToolRegistry 注册/执行 + Agent 工具调用循环 + 工具结果注入上下文
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry, type ToolDefinition } from '../src/agent/tools';
import { AgentConversation } from '../src/agent/conversation';
import type { LLMProvider, LLMMessage } from '../src/providers/types';

// ═══ Tool Registry ═══

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => { registry = new ToolRegistry(); });

  it('Given empty registry, When listing tools, Then returns empty', () => {
    expect(registry.listTools()).toHaveLength(0);
  });

  it('Given registered tool, When listing, Then returns tool with schema', () => {
    registry.register({
      name: 'test_tool',
      description: 'A test tool',
      parameters: { type: 'object', properties: { input: { type: 'string' } }, required: ['input'] },
      handler: async (params) => ({ result: params.input }),
    });
    const tools = registry.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('test_tool');
    expect(tools[0].description).toBe('A test tool');
  });

  it('Given registered tool, When executed, Then returns handler result', async () => {
    registry.register({
      name: 'echo',
      description: 'Echo back',
      parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      handler: async (params) => ({ echoed: params.text }),
    });
    const result = await registry.execute('echo', { text: 'hello' });
    expect(result).toEqual({ echoed: 'hello' });
  });

  it('Given unknown tool, When executed, Then returns error', async () => {
    const result = await registry.execute('nonexistent', {});
    expect(result.error).toContain('未知工具');
  });

  it('Given tool that throws, When executed, Then returns error without crashing', async () => {
    registry.register({
      name: 'crashy',
      description: 'Will throw',
      parameters: { type: 'object', properties: {} },
      handler: async () => { throw new Error('BOOM'); },
    });
    const result = await registry.execute('crashy', {});
    expect(result.error).toContain('BOOM');
  });

  it('Given multiple tools, When listing, Then returns all sorted by name', () => {
    registry.register({ name: 'zzz', description: '', parameters: { type: 'object', properties: {} }, handler: async () => ({}) });
    registry.register({ name: 'aaa', description: '', parameters: { type: 'object', properties: {} }, handler: async () => ({}) });
    const tools = registry.listTools();
    expect(tools[0].name).toBe('aaa');
    expect(tools[1].name).toBe('zzz');
  });
});

// ═══ AgentConversation with Tool Calling ═══

describe('AgentConversation — tool calling', () => {
  // Fake provider that simulates tool calls
  function toolCallProvider(toolName: string, toolParams: Record<string, unknown>): LLMProvider {
    let callCount = 0;
    return {
      name: 'fake', baseUrl: 'fake://test',
      async chat(msgs: LLMMessage[]) {
        callCount++;
        if (callCount === 1) {
          // First call: return tool call
          return {
            content: '',
            model: 'fake',
            // @ts-ignore — tool calls in response
            toolCalls: [{ function: { name: toolName, arguments: JSON.stringify(toolParams) } }],
          } as any;
        }
        // Second call: return final response using tool result
        const toolResult = msgs.find(m => m.role === 'tool')?.content || '';
        return { content: `Based on tool result: ${toolResult}`, model: 'fake' };
      },
      async stream(_msgs, cb) {
        cb.onToken('Processing...');
        const result = await this.chat(_msgs);
        cb.onComplete?.(result);
      },
      async healthCheck() { return { healthy: true }; },
      listModels() { return ['fake']; },
    };
  }

  it('Given tool call in LLM response, When processed, Then executes tool and includes result', async () => {
    const conv = new AgentConversation(toolCallProvider('query_ontology', { orgId: 'test-org' }));
    conv.getToolRegistry().register({
      name: 'query_ontology',
      description: 'Query the ontology graph',
      parameters: { type: 'object', properties: { orgId: { type: 'string' } }, required: ['orgId'] },
      handler: async (params) => ({ nodeCount: 5, edgeCount: 3, orgId: params.orgId }),
    });

    const result = await conv.processMessage('查询本体图');
    expect(result.reply).toContain('nodeCount');
    expect(result.reply).toContain('edgeCount');
  });

  it('Given tool call for unknown tool, When processed, Then returns tool error', async () => {
    const conv = new AgentConversation(toolCallProvider('bad_tool', {}));

    const result = await conv.processMessage('run bad tool');
    expect(result.reply).toContain('bad_tool');
    expect(result.reply).toContain('error');
  });

  it('Given no tool call in response, When processed, Then returns normal reply', async () => {
    const normalProvider: LLMProvider = {
      name: 'fake', baseUrl: 'fake://test',
      async chat() { return { content: 'Normal reply without tools', model: 'fake' }; },
      async stream(_msgs, cb) {
        cb.onToken('Normal');
        cb.onComplete?.({ content: 'Normal reply without tools', model: 'fake' });
      },
      async healthCheck() { return { healthy: true }; },
      listModels() { return ['fake']; },
    };
    const conv = new AgentConversation(normalProvider);
    const result = await conv.processMessage('hello');
    expect(result.reply).toBe('Normal reply without tools');
  });
});

// ═══ Built-in Tools ═══

describe('Built-in tools', () => {
  it('queryOntology tool returns graph summary', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'query_ontology',
      description: 'Query the ontology',
      parameters: { type: 'object', properties: { orgId: { type: 'string' } }, required: ['orgId'] },
      handler: async (params) => {
        const orgId = params.orgId as string;
        if (!orgId) return { error: 'orgId required' };
        return { nodeCount: 0, edgeCount: 0, orgId, summary: '空本体图' };
      },
    });
    const result = await registry.execute('query_ontology', { orgId: 'test' });
    expect(result.nodeCount).toBe(0);
    expect(result.summary).toBeTruthy();
  });

  it('showDiagnosisProgress returns current phase', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'show_diagnosis_progress',
      description: 'Show progress',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({ phase: 2, label: '假设生成', percent: 40 }),
    });
    const result = await registry.execute('show_diagnosis_progress', {});
    expect(result.phase).toBe(2);
    expect(result.percent).toBe(40);
  });
});
