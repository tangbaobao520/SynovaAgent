/**
 * orchestrator/hooks-executor.test.ts — Iter 4: Hook系统 + LLMPhaseExecutor 测试
 *
 * 对标 Claw-Code: Given/When/Then + 手写 fake
 * 铁律 0-2: 每个 public 函数 >= 2 用例 (happy + sad)
 *
 * 参考:
 *   Claw-Code hooks.rs: PreToolUse / PostToolUse / PostToolUseFailure
 *   Hermes credential_pool.py: 权限检查 + 审计
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HookRunner, type PreToolUseHook, type PostToolUseHook, type PostToolUseFailureHook } from '../../src/orchestrator/hook-runner';
import { LLMPhaseExecutor } from '../../src/orchestrator/llm-phase-executor';
import type { LLMClient, ToolExecutor } from '../../src/orchestrator/diagnosis-orchestrator';
import type { LLMProvider, ChatResult, StreamCallback } from '../../src/providers/types';

// ═══ Hook Tests ═══

describe('HookRunner', () => {
  let runner: HookRunner;

  beforeEach(() => { runner = new HookRunner(); });

  // ── PreToolUse ──

  it('Given no hooks registered, When preToolUse runs, Then returns allow', async () => {
    const result = await runner.runPreToolUse({ name: 'query_db', input: '{}' });
    expect(result.action).toBe('allow');
  });

  it('Given a deny hook, When preToolUse runs, Then returns deny', async () => {
    const denyHook: PreToolUseHook = {
      name: 'permission-check',
      async onPreToolUse(tool) {
        if (tool.name === 'dangerous_tool') return { action: 'deny', reason: 'Access denied' };
        return { action: 'allow' };
      },
    };
    runner.registerPreToolUse(denyHook);
    const result = await runner.runPreToolUse({ name: 'dangerous_tool', input: '{}' });
    expect(result.action).toBe('deny');
    expect(result.reason).toBe('Access denied');
  });

  it('Given a modify hook, When preToolUse runs, Then returns modified input', async () => {
    const modifyHook: PreToolUseHook = {
      name: 'pii-scrubber',
      async onPreToolUse(tool) {
        const scrubbed = tool.input.replace('13812345678', '[PHONE]');
        return { action: 'modify', modifiedInput: scrubbed };
      },
    };
    runner.registerPreToolUse(modifyHook);
    const result = await runner.runPreToolUse({ name: 'send_message', input: 'call 13812345678' });
    expect(result.action).toBe('modify');
    expect(result.modifiedInput).toContain('[PHONE]');
  });

  it('Given multiple hooks, When first denies, Then remaining hooks skip', async () => {
    const denyHook: PreToolUseHook = {
      name: 'blocker',
      async onPreToolUse() { return { action: 'deny' }; },
    };
    let secondCalled = false;
    const secondHook: PreToolUseHook = {
      name: 'never-called',
      async onPreToolUse() { secondCalled = true; return { action: 'allow' }; },
    };
    runner.registerPreToolUse(denyHook);
    runner.registerPreToolUse(secondHook);
    await runner.runPreToolUse({ name: 'any', input: '{}' });
    expect(secondCalled).toBe(false);
  });

  // ── PostToolUse ──

  it('Given a post hook, When tool executes successfully, Then hook called', async () => {
    const evidence: string[] = [];
    const evidenceHook: PostToolUseHook = {
      name: 'evidence-collector',
      async onPostToolUse(tool, result) {
        evidence.push(`tool:${tool.name} result:${result.content}`);
      },
    };
    runner.registerPostToolUse(evidenceHook);
    await runner.runPostToolUse({ name: 'query_db', input: '{}' }, { content: '5 rows' });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toContain('query_db');
    expect(evidence[0]).toContain('5 rows');
  });

  // ── PostToolUseFailure ──

  it('Given a failure hook, When tool fails, Then hook called with error', async () => {
    const failures: string[] = [];
    const failureHook: PostToolUseFailureHook = {
      name: 'error-logger',
      async onPostToolUseFailure(tool, error) {
        failures.push(`${tool.name}: ${error.message}`);
      },
    };
    runner.registerPostToolUseFailure(failureHook);
    await runner.runPostToolUseFailure(
      { name: 'broken_tool', input: '{}' },
      new Error('Connection refused'),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('broken_tool');
    expect(failures[0]).toContain('Connection refused');
  });
});

// ═══ LLMPhaseExecutor Tests ═══

describe('LLMPhaseExecutor', () => {
  // Fake provider that returns controllable responses
  function fakeProvider(responseText: string, toolCalls?: Array<{ function: { name: string; arguments: string } }>): LLMProvider {
    return {
      name: 'fake', baseUrl: 'fake://',
      async chat(): Promise<ChatResult> {
        return { content: responseText, model: 'fake', toolCalls };
      },
      async stream(_msgs: any, cb: StreamCallback) {
        for (const ch of responseText) cb.onToken(ch);
        cb.onComplete?.({ content: responseText, model: 'fake' });
      },
      async healthCheck() { return { healthy: true }; },
      listModels() { return ['fake']; },
    };
  }

  it('Given no tool calls, When executeTurn runs, Then returns reply without tool loop', async () => {
    const llmClient: LLMClient = {
      async consult() { return { content: '分析完成', model: 'fake' }; },
    };
    const toolExecutor: ToolExecutor = {
      async execute() { return { content: 'ok' }; },
    };
    const executor = new LLMPhaseExecutor(llmClient, toolExecutor, { maxRounds: 3 });

    const result = await executor.executeTurn([
      { role: 'system', content: '你是诊断专家' },
      { role: 'user', content: '分析这个组织' },
    ]);

    expect(result.reply).toBe('分析完成');
    expect(result.toolCallCount).toBe(0);
  });

  it('Given tool calls via marker in response, When executeTurn runs, Then tools executed and continues', async () => {
    let callCount = 0;
    let toolExecuted = false;
    const llmClient: LLMClient = {
      async consult() {
        callCount++;
        if (callCount === 1) return { content: '[工具调用: my_tool]', model: 'fake' };
        return { content: 'Final analysis after tool', model: 'fake' };
      },
    };
    const toolExecutor: ToolExecutor = {
      async execute(name) { toolExecuted = true; return { content: `result from ${name}` }; },
    };

    const executor = new LLMPhaseExecutor(llmClient, toolExecutor, { maxRounds: 3 });
    const result = await executor.executeTurn([{ role: 'user', content: 'analyze' }]);

    expect(toolExecuted).toBe(true);
    expect(result.reply).toBeTruthy();
  });

  it('Given maxRounds=1 with tool calls each round, When executeTurn runs, Then returns reply after maxRounds', async () => {
    const llmClient: LLMClient = {
      async consult() { return { content: '[工具调用: test_tool]', model: 'fake' }; },
    };
    const toolExecutor: ToolExecutor = {
      async execute() { return { content: 'ok' }; },
    };
    const executor = new LLMPhaseExecutor(llmClient, toolExecutor, { maxRounds: 1 });

    const result = await executor.executeTurn([{ role: 'user', content: 'test' }]);

    // Should return some reply after max rounds
    expect(result.reply).toBeTruthy();
    expect(result.roundsTaken).toBeGreaterThanOrEqual(1);
  });

  it('Given tool execution fails, When executeTurn runs, Then error recorded but continues', async () => {
    let callCount = 0;
    const llmClient: LLMClient = {
      async consult() {
        callCount++;
        if (callCount === 1) return {
          content: '[工具调用: crashy_tool]',
          model: 'fake',
        };
        return { content: 'recovered from error', model: 'fake' };
      },
    };
    const toolExecutor: ToolExecutor = {
      async execute() { throw new Error('Tool crash'); },
    };

    const executor = new LLMPhaseExecutor(llmClient, toolExecutor, { maxRounds: 2 });
    const result = await executor.executeTurn([{ role: 'user', content: 'test' }]);

    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors.some(e => e.includes('Tool crash'))).toBe(true);
  });
});
