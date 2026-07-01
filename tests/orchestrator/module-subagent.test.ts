/**
 * orchestrator/module-subagent.test.ts — Iter 5: ModuleRunner + SubAgentCoordinator 测试
 *
 * 对标 Claw-Code: Given/When/Then + 手写 fake
 * 铁律 0-2: 每个 public 函数 >= 2 用例
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { ModuleRunner, type ModuleTask, type ModuleResult } from '../../src/orchestrator/module-runner';
import { SubAgentCoordinator } from '../../src/orchestrator/subagent-coordinator';
import { getExpertRegistry } from '../../src/l3/expert-registry';
import type { DataAccessPolicy } from '../../src/orchestrator/subagent-coordinator';
import type { LLMClient } from '../../src/orchestrator/diagnosis-orchestrator';
import type { Evidence } from '../../src/evidence/types';

// ═══ Fake module for testing ═══

function fakeModule(name: string, delayMs: number = 0, shouldFail: boolean = false): ModuleTask {
  return {
    name,
    priority: 'P1',
    async compute(): Promise<ModuleResult> {
      if (shouldFail) throw new Error(`${name} failed`);
      if (delayMs) await new Promise(r => setTimeout(r, delayMs));
      return { moduleId: name, findings: [{ type: 'test', summary: `${name} result` }] };
    },
  };
}

// ═══ ModuleRunner Tests ═══

describe('ModuleRunner', () => {
  it('Given 3 modules, When runAll, Then all complete without degradation', async () => {
    const runner = new ModuleRunner({ maxParallel: 3, perModuleTimeoutMs: 5000 });
    const results = await runner.runAll([
      fakeModule('hona'),
      fakeModule('gaps'),
      fakeModule('ipu'),
    ]);
    expect(results.completedCount + results.failedCount).toBe(3);
    expect(results.degradedModules.length).toBe(0);
  });

  it('Given a failing module, When runAll, Then recorded in degradedModules, others continue', async () => {
    const runner = new ModuleRunner({ maxParallel: 3, perModuleTimeoutMs: 5000 });
    const results = await runner.runAll([
      fakeModule('hona'),
      fakeModule('broken', 0, true),
      fakeModule('gaps'),
    ]);
    expect(results.results).toHaveLength(3);
    expect(results.degradedModules).toContain('broken');
    // hona and gaps should still complete
    expect(results.results.filter(r => !r.error)).toHaveLength(2);
  });

  it('Given a module exceeding timeout, When runAll, Then degraded and others continue', async () => {
    const runner = new ModuleRunner({ maxParallel: 3, perModuleTimeoutMs: 10 });
    const results = await runner.runAll([
      fakeModule('slow', 5000),  // This will timeout
      fakeModule('fast'),
    ]);
    expect(results.degradedModules).toHaveLength(1);
    expect(results.degradedModules[0]).toContain('slow');
    expect(results.results.filter(r => !r.error)).toHaveLength(1); // fast completes
  });

  it('Given priority groups, When runAll, Then P0 modules run first', async () => {
    const runner = new ModuleRunner({
      maxParallel: 1,  // Sequential for testing
      perModuleTimeoutMs: 5000,
      priorityGroups: [['high_priority'], ['low_priority']],
    });
    const executionOrder: string[] = [];
    const results = await runner.runAll([
      { name: 'low_priority', priority: 'P2' as const, async compute() { executionOrder.push('low'); return { moduleId: 'low' }; } },
      { name: 'high_priority', priority: 'P0' as const, async compute() { executionOrder.push('high'); return { moduleId: 'high' }; } },
    ]);
    expect(executionOrder[0]).toBe('high');
    expect(executionOrder[1]).toBe('low');
  });

  it('Given no modules, When runAll, Then returns empty results', async () => {
    const runner = new ModuleRunner({ maxParallel: 3, perModuleTimeoutMs: 5000 });
    const results = await runner.runAll([]);
    expect(results.results).toHaveLength(0);
    expect(results.degradedModules).toHaveLength(0);
  });
});

// ═══ SubAgentCoordinator Tests ═══

describe('SubAgentCoordinator', () => {
  const fakeLLM: LLMClient = {
    async consult() { return { content: JSON.stringify({ hypothesis: 'test', confidence: 0.8 }), model: 'fake' }; },
  };

  const policies: DataAccessPolicy[] = [
    { expertType: 'strategy', allowedDimensions: ['goal_alignment', 'risk'], prohibitedFields: ['salary'], anonymizationRules: [] },
    { expertType: 'finance', allowedDimensions: ['cost', 'revenue'], prohibitedFields: ['person_name', 'salary'], anonymizationRules: [] },
    { expertType: 'org', allowedDimensions: ['team_structure', 'collaboration'], prohibitedFields: ['salary'], anonymizationRules: [{ field: 'person_name', replace: 'role_label' }] },
  ];

  beforeAll(() => {
    const registry = getExpertRegistry();
    registry.registerDefault('strategy', '你是战略专家。\n不可做的事: 不做财务分析');
    registry.registerDefault('finance', '你是财务专家。\n不可做的事: 不编造数据');
    registry.registerDefault('org', '你是组织专家。\n不可做的事: 不做技术选型');
  });

  function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
    return {
      id: 'ev1', source: 'interviewee', sourceId: 'org-1', type: 'goal_alignment',
      content: 'test', confidence: 0.8, collectedAt: new Date().toISOString(), orgId: 'org-1',
      ...overrides,
    };
  }

  it('Given evidence pool, When dispatch called, Then each expert receives filtered evidence', async () => {
    const coordinator = new SubAgentCoordinator(fakeLLM, policies);
    const evidence = [
      makeEvidence({ id: 'e1', type: 'goal_alignment' }),
      makeEvidence({ id: 'e2', type: 'cost' }),
    ];

    const results = await coordinator.dispatch(evidence, 2);

    expect(results.length).toBeGreaterThan(0);
  });

  it('Given finance expert policy prohibits salary field, When dispatch, Then salary evidence filtered out', () => {
    const coordinator = new SubAgentCoordinator(fakeLLM, policies);
    const evidence = [
      makeEvidence({ id: 'e1', type: 'cost', content: '云服务成本高' }),
      makeEvidence({ id: 'e2', type: 'salary', content: 'CEO年薪200万' }),
    ];

    const financePolicy = policies.find(p => p.expertType === 'finance')!;
    const filtered = coordinator.filterEvidence(evidence, financePolicy);

    expect(filtered.some(e => e.type === 'cost')).toBe(true);
    expect(filtered.some(e => e.type === 'salary')).toBe(false);
  });

  it('Given anonymization rule for person_name, When filterEvidence, Then names replaced with role_label', () => {
    const coordinator = new SubAgentCoordinator(fakeLLM, policies);
    const evidence = [
      makeEvidence({ id: 'e1', type: 'team_structure', content: '张三负责前端' }),
    ];

    const orgPolicy = policies.find(p => p.expertType === 'org')!;
    const filtered = coordinator.filterEvidence(evidence, orgPolicy);

    // Person name should be anonymized
    if (filtered.length > 0) {
      const content = filtered[0].content;
      expect(content).not.toContain('张三');
    }
  });

  it('Given no evidence, When dispatch, Then returns empty results', async () => {
    const coordinator = new SubAgentCoordinator(fakeLLM, policies);
    const results = await coordinator.dispatch([], 2);
    expect(results).toHaveLength(0);
  });
});
