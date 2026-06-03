/**
 * orchestrator/phase0-engine.test.ts — Iter 3: Phase0Engine + IntentRouter + DimensionRegistry 测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { IntentRouter } from '../../src/orchestrator/intent-router';
import { DimensionRegistry } from '../../src/orchestrator/dimension-registry';

// Fake LLM client for testing
function fakeLLMClient(response: string = '{"intent":"clear_pain_point","category":"diagnostic","confidence":0.9,"signals":["流失率"],"suggestedDimensions":["资源约束"]}') {
  return {
    async consult() { return { content: response, model: 'fake' }; },
  };
}

describe('IntentRouter', () => {
  it('Given a greeting, When classified, Then returns greeting intent (fast-path, zero LLM)', async () => {
    const router = new IntentRouter(fakeLLMClient());
    const result = await router.classify('你好');
    expect(result.intent).toBe('greeting');
    expect(result.category).toBe('non_diagnostic');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('Given "你能做什么", When classified, Then returns ask_capability (fast-path)', async () => {
    const router = new IntentRouter(fakeLLMClient());
    const result = await router.classify('你能做什么？介绍一下');
    expect(result.intent).toBe('ask_capability');
  });

  it('Given "你听不懂", When classified, Then returns confusion (fast-path)', async () => {
    const router = new IntentRouter(fakeLLMClient());
    const result = await router.classify('你听不懂我说的话');
    expect(result.intent).toBe('confusion');
  });

  it('Given ambiguous input, When fast-path does not match, Then calls LLM', async () => {
    let called = false;
    const llmClient = {
      async consult() { called = true; return { content: '{"intent":"clear_pain_point","category":"diagnostic","confidence":0.85,"signals":["流失"]}', model: 'fake' }; },
    };
    const router = new IntentRouter(llmClient);
    const result = await router.classify('我们最近人员流失比较严重');
    expect(called).toBe(true);
    expect(result.intent).toBe('clear_pain_point');
  });
});

describe('DimensionRegistry', () => {
  let registry: DimensionRegistry;

  beforeEach(() => { registry = new DimensionRegistry(); });

  it('Given new registry, When listAll, Then returns core + industry dimensions sorted by priority', () => {
    const all = registry.listAll();
    expect(all.length).toBeGreaterThanOrEqual(6);
    expect(all[0].category).toBe('core');
  });

  it('Given manufacturing industry, When listForIndustry, Then includes supply_chain dimension', () => {
    const dims = registry.listForIndustry('manufacturing');
    const ids = dims.map(d => d.id);
    expect(ids).toContain('supply_chain');
  });

  it('Given tech industry, When listForIndustry, Then includes rd_efficiency dimension', () => {
    const dims = registry.listForIndustry('tech');
    const ids = dims.map(d => d.id);
    expect(ids).toContain('rd_efficiency');
  });

  it('Given unknown industry, When listForIndustry, Then returns only core dimensions', () => {
    const dims = registry.listForIndustry('unknown_industry_xyz');
    const nonCore = dims.filter(d => d.category !== 'core');
    expect(nonCore).toHaveLength(0);
  });

  it('Given signals ["合规", "GDPR"], When selectBySignals, Then activates compliance dimension', () => {
    const dims = registry.selectBySignals(['合规', 'GDPR', '审计'], 'finance');
    const ids = dims.map(d => d.id);
    expect(ids).toContain('compliance');
  });

  it('Given no matching signals, When selectBySignals, Then returns all core dimensions', () => {
    const dims = registry.selectBySignals(['nothing_matches'], undefined);
    expect(dims.length).toBeGreaterThanOrEqual(6);
  });

  it('Given new dimension registered, When listAll, Then includes the new dimension', () => {
    registry.register({
      id: 'test_dim', name: '测试维度', category: 'scenario', priority: 99,
      triggerSignals: ['测试'],
      questions: [{ id: 't1', text: '测试问题', reason: '测试', required: true }],
    });
    const all = registry.listAll();
    expect(all.map(d => d.id)).toContain('test_dim');
  });
});
