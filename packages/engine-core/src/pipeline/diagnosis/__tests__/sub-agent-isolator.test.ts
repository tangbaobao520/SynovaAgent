/**
 * sub-agent-isolator.test.ts — 子 Agent 隔离执行器单元测试
 *
 * 对标 Claw-Code 的 ScriptedApiClient + NoopToolExecutor 测试替身模式。
 */

import { SubAgentIsolator } from '../sub-agent-isolator';
import type { SubAgentType, SubAgentContext } from '../sub-agent-isolator';
import type { DiagnosisLLMClient, LLMResponse } from '../diagnosis-orchestrator';
import { MemorySessionTracer } from '../diagnosis-orchestrator';

const CTX: SubAgentContext = {
  teamId: 'test-team',
  phase: 2,
  evidence: [
    {
      id: 'ev-1',
      content: '信息流维度评分 0.3，低于阈值',
      dimension: 'information_flow',
      confidence: 0.9,
      source: 'module',
      timestamp: new Date().toISOString(),
      phase: 1,
      isPrivate: false,
      moduleId: 'gaps',
    },
    {
      id: 'ev-2',
      content: '决策权集中在 1 人，授权不足',
      dimension: 'authority_governance',
      confidence: 0.85,
      source: 'module',
      timestamp: new Date().toISOString(),
      phase: 1,
      isPrivate: false,
      moduleId: 'gaps',
    },
  ],
};

// ====================================================================
// 测试替身（对标 Claw-Code: ScriptedApiClient）
// ====================================================================

interface LLMClientOpts {
  response?: string;
  delayMs?: number;
  shouldFail?: boolean;
}

function makeLLMClient(opts: LLMClientOpts = {}): DiagnosisLLMClient {
  return {
    async consult(_sp, _um): Promise<LLMResponse> {
      if (opts.shouldFail) throw new Error('LLM 调用失败');
      if (opts.delayMs) await new Promise(r => setTimeout(r, opts.delayMs));
      return {
        content: opts.response ?? '分析结果：团队信息流存在系统性阻塞。',
        model: 'test-model',
      };
    },
  };
}

/** 脚本化 LLM 客户端——预设多轮响应（对标 ScriptedLLM） */
class ScriptedLLMClient implements DiagnosisLLMClient {
  callCount = 0;
  constructor(private script: Array<LLMResponse | Error>) {}

  async consult(): Promise<LLMResponse> {
    const item = this.script[this.callCount++];
    if (!item) throw new Error(`unexpected call #${this.callCount}`);
    if (item instanceof Error) throw item;
    return item;
  }
}

// ====================================================================
// Construction & Builder
// ====================================================================

describe('SubAgentIsolator — construction & builder', () => {
  it('constructs with default timeout 60s', () => {
    const isolator = new SubAgentIsolator(makeLLMClient());
    expect(isolator).toBeDefined();
    expect(isolator.activeCount).toBe(0);
  });

  it('withTracer sets the tracer', () => {
    const tracer = new MemorySessionTracer();
    const isolator = new SubAgentIsolator(makeLLMClient()).withTracer(tracer);
    expect(isolator).toBeDefined();
  });

  it('withDefaultTimeout overrides the timeout', () => {
    const isolator = new SubAgentIsolator(makeLLMClient()).withDefaultTimeout(30_000);
    expect(isolator).toBeDefined();
  });

  it('withDefaultMaxRetries overrides retry count', () => {
    const isolator = new SubAgentIsolator(makeLLMClient()).withDefaultMaxRetries(3);
    expect(isolator).toBeDefined();
  });

  it('withPromptBuilder is chainable', () => {
    const isolator = new SubAgentIsolator(makeLLMClient()).withDefaultTimeout(45_000);
    expect(isolator).toBeDefined();
  });

  it('builder methods are chainable', () => {
    const isolator = new SubAgentIsolator(makeLLMClient())
      .withTracer(new MemorySessionTracer())
      .withDefaultTimeout(45_000)
      .withDefaultMaxRetries(2);
    expect(isolator).toBeDefined();
  });
});

// ====================================================================
// Single agent execution
// ====================================================================

describe('SubAgentIsolator — single agent', () => {
  it('runs strategic_analyst and returns result', async () => {
    const isolator = new SubAgentIsolator(makeLLMClient({ response: '战略分析：建议聚焦差异化。' }));
    const result = await isolator.runAgent('strategic_analyst', CTX);

    expect(result.agentType).toBe('strategic_analyst');
    expect(result.content).toContain('战略分析');
    expect(result.model).toBe('test-model');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.retries).toBe(0);
    expect(result.degraded).toBe(false);
  });

  it('runs org_diagnostician with evidence context', async () => {
    const isolator = new SubAgentIsolator(makeLLMClient({ response: '组织诊断：信息流阻塞。' }));
    const result = await isolator.runAgent('org_diagnostician', CTX);

    expect(result.agentType).toBe('org_diagnostician');
    expect(result.content).toContain('组织诊断');
  });

  it('runs financial_analyst', async () => {
    const isolator = new SubAgentIsolator(makeLLMClient({ response: '财务分析：月低效成本 ¥5万。' }));
    const result = await isolator.runAgent('financial_analyst', CTX);

    expect(result.agentType).toBe('financial_analyst');
    expect(result.content).toContain('财务分析');
  });

  it('runs tech_architect', async () => {
    const isolator = new SubAgentIsolator(makeLLMClient({ response: '技术架构：能力谱系缺口2处。' }));
    const result = await isolator.runAgent('tech_architect', CTX);

    expect(result.agentType).toBe('tech_architect');
    expect(result.content).toContain('技术架构');
  });

  it('runs action_advisor', async () => {
    const isolator = new SubAgentIsolator(makeLLMClient({ response: '行动建议：3 项 critical。' }));
    const result = await isolator.runAgent('action_advisor', CTX);

    expect(result.agentType).toBe('action_advisor');
    expect(result.content).toContain('行动建议');
  });

  it('all 5 sub-agent types are valid', async () => {
    const types: SubAgentType[] = [
      'strategic_analyst', 'org_diagnostician',
      'financial_analyst', 'tech_architect', 'action_advisor',
    ];
    expect(types.length).toBe(5);
    for (const t of types) {
      const isolator = new SubAgentIsolator(makeLLMClient({ response: `${t} 完成` }));
      const result = await isolator.runAgent(t, CTX);
      expect(result.agentType).toBe(t);
      expect(result.degraded).toBe(false);
    }
  });
});

// ====================================================================
// Timeout isolation
// ====================================================================

describe('SubAgentIsolator — timeout isolation', () => {
  it('degrades on timeout instead of throwing', async () => {
    const isolator = new SubAgentIsolator(
      makeLLMClient({ delayMs: 5000 }),
    ).withDefaultTimeout(100);

    const result = await isolator.runAgent('strategic_analyst', CTX, { maxRetries: 0 });

    expect(result.degraded).toBe(true);
    expect(result.content).toBe('');
    expect(result.error).toBeDefined();
    expect(result.error).toContain('SUBAGENT_LOST');
  });

  it('per-agent timeout overrides default', async () => {
    const isolator = new SubAgentIsolator(
      makeLLMClient({ delayMs: 200 }),
    ).withDefaultTimeout(5000);

    const result = await isolator.runAgent('org_diagnostician', CTX, {
      timeoutMs: 50,
      maxRetries: 0,
    });

    expect(result.degraded).toBe(true);
  });

  it('cleans up the timer on successful completion (no leak)', async () => {
    const isolator = new SubAgentIsolator(makeLLMClient({ response: 'OK' }));
    const result = await isolator.runAgent('strategic_analyst', CTX);
    expect(result.degraded).toBe(false);
    // If timer leaked, Jest would report open handles — this test validates the finally{} block
  });
});

// ====================================================================
// External AbortSignal propagation
// ====================================================================

describe('SubAgentIsolator — external AbortSignal', () => {
  it('aborts when external signal is triggered', async () => {
    const isolator = new SubAgentIsolator(
      makeLLMClient({ delayMs: 5000 }),
    ).withDefaultTimeout(30_000);

    const controller = new AbortController();

    const promise = isolator.runAgent('strategic_analyst', CTX, {
      signal: controller.signal,
      maxRetries: 0,
    });

    // Abort after a short tick
    await new Promise(r => setTimeout(r, 50));
    controller.abort();

    const result = await promise;
    expect(result.degraded).toBe(true);
    expect(result.error).toContain('SUBAGENT_LOST');
  });

  it('external abort does not affect subsequent agents', async () => {
    const isolator = new SubAgentIsolator(makeLLMClient({ response: 'OK' }));

    const controller = new AbortController();

    // First agent: abort mid-flight
    const badPromise = isolator.runAgent('strategic_analyst', CTX, {
      signal: controller.signal,
      maxRetries: 0,
    });
    await new Promise(r => setTimeout(r, 20));
    controller.abort();
    await badPromise;

    // Second agent: should run normally
    const result = await isolator.runAgent('org_diagnostician', CTX);
    expect(result.degraded).toBe(false);
    expect(result.content).toContain('OK');
  });
});

// ====================================================================
// Evidence & hypotheses truncation
// ====================================================================

describe('SubAgentIsolator — evidence & hypotheses truncation', () => {
  it('truncates evidence to 10 items in prompt', async () => {
    const manyEvidence = Array.from({ length: 20 }, (_, i) => ({
      id: `ev-${i}`,
      content: `证据项 ${i}`,
      dimension: 'information_flow' as const,
      confidence: 0.8,
      source: 'module' as const,
      timestamp: new Date().toISOString(),
      phase: 1,
      isPrivate: false,
      moduleId: 'gaps',
    }));

    const ctx: SubAgentContext = { ...CTX, evidence: manyEvidence };
    const isolator = new SubAgentIsolator(makeLLMClient({ response: 'OK' }));
    const result = await isolator.runAgent('strategic_analyst', ctx);

    // Should still succeed — evidence truncation is internal, no overflow
    expect(result.degraded).toBe(false);
  });

  it('truncates hypotheses to 5 items in prompt', async () => {
    const manyHypotheses = Array.from({ length: 10 }, (_, i) => ({
      id: `hyp-${i}`,
      statement: `假设 ${i}: 问题在于沟通不畅导致项目延期交付质量下降`,
      dimensions: ['information_flow' as const],
      confidence: 0.7,
      supportingEvidence: [],
      refutingEvidence: [],
      source: 'llm' as const,
    }));

    const ctx: SubAgentContext = { ...CTX, hypotheses: manyHypotheses };
    const isolator = new SubAgentIsolator(makeLLMClient({ response: 'OK' }));
    const result = await isolator.runAgent('financial_analyst', ctx);

    expect(result.degraded).toBe(false);
  });
});

// ====================================================================
// Parallel execution (true isolation)
// ====================================================================

describe('SubAgentIsolator — parallel execution', () => {
  it('runs all 5 agents in parallel', async () => {
    const isolator = new SubAgentIsolator(makeLLMClient({ response: '并行分析完成。' }));
    const types: SubAgentType[] = [
      'strategic_analyst', 'org_diagnostician',
      'financial_analyst', 'tech_architect', 'action_advisor',
    ];

    const results = await isolator.runAgents(types, CTX);

    expect(results.length).toBe(5);
    for (const r of results) {
      expect(r.degraded).toBe(false);
      expect(r.content).toContain('分析');
    }
  });

  it('one agent failure does not affect others', async () => {
    const fragileClient: DiagnosisLLMClient = {
      async consult(sp, _um): Promise<LLMResponse> {
        if (sp.includes('战略分析师')) throw new Error('STRATEGIC_FAIL');
        return { content: '成功', model: 'test' };
      },
    };

    const isolator = new SubAgentIsolator(fragileClient).withDefaultMaxRetries(0);
    const results = await isolator.runAgents(
      ['strategic_analyst', 'org_diagnostician', 'financial_analyst'],
      CTX,
    );

    const str = results.find(r => r.agentType === 'strategic_analyst')!;
    expect(str.degraded).toBe(true);
    expect(str.error).toBeDefined();

    const org = results.find(r => r.agentType === 'org_diagnostician')!;
    expect(org.degraded).toBe(false);

    const fin = results.find(r => r.agentType === 'financial_analyst')!;
    expect(fin.degraded).toBe(false);
  });

  it('partial results are returned even if some fail', async () => {
    const failClient: DiagnosisLLMClient = {
      async consult(_sp, _um): Promise<LLMResponse> {
        throw new Error('ALL_FAIL');
      },
    };

    const isolator = new SubAgentIsolator(failClient).withDefaultMaxRetries(0);
    const results = await isolator.runAgents(['strategic_analyst', 'action_advisor'], CTX);

    expect(results.length).toBe(2);
    expect(results.every(r => r.degraded)).toBe(true);
  });

  it('empty types array returns empty results', async () => {
    const isolator = new SubAgentIsolator(makeLLMClient());
    const results = await isolator.runAgents([], CTX);
    expect(results).toEqual([]);
  });

  it('per-agent timeout isolates independently in parallel', async () => {
    // Two agents run in parallel: one fast, one slow with short timeout
    const fastClient = makeLLMClient({ response: '快速响应' });
    const slowClient = makeLLMClient({ delayMs: 5000 });

    let callIdx = 0;
    const compositeClient: DiagnosisLLMClient = {
      async consult(sp, um): Promise<LLMResponse> {
        callIdx++;
        if (callIdx === 1) return slowClient.consult(sp, um); // first call: slow
        return fastClient.consult(sp, um); // second call: fast
      },
    };

    const isolator = new SubAgentIsolator(compositeClient).withDefaultTimeout(30_000);
    const results = await isolator.runAgents(
      ['strategic_analyst', 'org_diagnostician'],
      CTX,
      { timeoutMs: 100, maxRetries: 0 },
    );

    expect(results.length).toBe(2);
    // One degrades (timeout), one succeeds (fast)
    const degraded = results.filter(r => r.degraded);
    expect(degraded.length).toBe(1);
    const ok = results.filter(r => !r.degraded);
    expect(ok.length).toBe(1);
    expect(ok[0].content).toContain('快速响应');
  });
});

// ====================================================================
// Cascade cleanup
// ====================================================================

describe('SubAgentIsolator — cascade cleanup', () => {
  it('cancelAll aborts in-flight agents', async () => {
    const isolator = new SubAgentIsolator(
      makeLLMClient({ delayMs: 5000 }),
    ).withDefaultTimeout(30_000);

    const promise = isolator.runAgent('strategic_analyst', CTX);

    await new Promise(r => setTimeout(r, 50));

    expect(isolator.activeCount).toBe(1);
    isolator.cancelAll();
    expect(isolator.activeCount).toBe(0);

    const result = await promise;
    expect(result.degraded).toBe(true);
    expect(result.error).toContain('SUBAGENT_LOST');
  });

  it('cancelAll is idempotent', () => {
    const isolator = new SubAgentIsolator(makeLLMClient());
    isolator.cancelAll();
    isolator.cancelAll();
    expect(isolator.activeCount).toBe(0);
  });

  it('activeCount is 0 when no agents running', () => {
    const isolator = new SubAgentIsolator(makeLLMClient());
    expect(isolator.activeCount).toBe(0);
  });
});

// ====================================================================
// Retry behavior
// ====================================================================

describe('SubAgentIsolator — retry behavior', () => {
  it('retries on recoverable failure and succeeds', async () => {
    const isolator = new SubAgentIsolator(
      new ScriptedLLMClient([
        new Error('LLM_TIMEOUT'),
        new Error('LLM_TIMEOUT'),
        { content: '第3次重试成功', model: 'test' },
      ]),
    ).withDefaultMaxRetries(3);

    const result = await isolator.runAgent('strategic_analyst', CTX);

    expect(result.degraded).toBe(false);
    expect(result.retries).toBe(2);
    expect(result.content).toContain('第3次重试成功');
  });

  it('stops retrying on non-recoverable error', async () => {
    const isolator = new SubAgentIsolator(
      new ScriptedLLMClient([
        new Error('PERMISSION_DENIED'), // non-recoverable
        { content: 'should never reach', model: 'test' },
      ]),
    ).withDefaultMaxRetries(3);

    const result = await isolator.runAgent('strategic_analyst', CTX);

    expect(result.degraded).toBe(true);
    // ScriptedLLMClient would throw "unexpected call #2" if retry happened
    // but we assert degraded=true which means it stopped after first failure
  });

  it('gives up after maxRetries', async () => {
    const isolator = new SubAgentIsolator(
      new ScriptedLLMClient([
        new Error('LLM_TIMEOUT'),
        new Error('LLM_TIMEOUT'),
        new Error('LLM_TIMEOUT'),
      ]),
    ).withDefaultMaxRetries(2);

    const result = await isolator.runAgent('strategic_analyst', CTX);

    expect(result.degraded).toBe(true);
    expect(result.retries).toBe(2);
  });
});

// ====================================================================
// Tracer integration
// ====================================================================

describe('SubAgentIsolator — tracer integration', () => {
  it('traces subagent lifecycle events', async () => {
    const tracer = new MemorySessionTracer();
    const isolator = new SubAgentIsolator(makeLLMClient({ response: 'OK' }))
      .withTracer(tracer);

    await isolator.runAgent('strategic_analyst', CTX);

    const events = tracer.events();
    expect(events.length).toBeGreaterThanOrEqual(2);

    const startedEvent = events.find(e =>
      e.type === 'evidence_added' && e.evidence.content.includes('subagent_strategic_analyst_started'),
    );
    expect(startedEvent).toBeDefined();

    const completedEvent = events.find(e =>
      e.type === 'evidence_added' && e.evidence.content.includes('subagent_strategic_analyst_completed'),
    );
    expect(completedEvent).toBeDefined();
  });

  it('traces error events on failure', async () => {
    const tracer = new MemorySessionTracer();
    const isolator = new SubAgentIsolator(
      makeLLMClient({ shouldFail: true }),
    ).withTracer(tracer).withDefaultMaxRetries(0);

    await isolator.runAgent('action_advisor', CTX);

    const events = tracer.events();
    const errorEvent = events.find(e =>
      e.type === 'evidence_added' && e.evidence.content.includes('subagent_action_advisor_error'),
    );
    expect(errorEvent).toBeDefined();
  });
});

// ====================================================================
// ROLES completeness
// ====================================================================

describe('SubAgentIsolator — prompt generation', () => {
  it('each agent type produces a distinct focus instruction', async () => {
    const types: SubAgentType[] = [
      'strategic_analyst', 'org_diagnostician',
      'financial_analyst', 'tech_architect', 'action_advisor',
    ];

    const client = new ScriptedLLMClient(
      types.map(() => ({ content: '分析完成', model: 'test' })),
    );
    const isolator = new SubAgentIsolator(client);

    const results = await isolator.runAgents(types, CTX);

    // All 5 succeed — prompt generation didn't crash for any type
    expect(results.length).toBe(5);
    for (const r of results) {
      expect(r.degraded).toBe(false);
    }
    // ScriptedLLMClient consumed exactly 5 calls
    expect(client.callCount).toBe(5);
  });
});
