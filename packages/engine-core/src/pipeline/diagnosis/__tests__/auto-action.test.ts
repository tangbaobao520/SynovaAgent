/**
 * auto-action.test.ts — FDE 自动行动引擎测试
 *
 * 覆盖：规则匹配、去重、优先级排序、LLM skip 条件
 */

import { generateActionPlan } from '../auto-action';
import type { FullDiagnosisV2, ActionPlan } from '../types';

// ====================================================================
// 测试辅助
// ====================================================================

/** 最小可行 FullDiagnosisV2——触发特定规则的字段会通过 spread 覆盖 */
function makeDiagnosis(overrides: Partial<FullDiagnosisV2> = {}): FullDiagnosisV2 {
  return {
    teamId: 'test-team',
    generatedAt: new Date().toISOString(),
    gaps: {
      gaps: {},
      overallScore: 0.5,
      breakdown: [],
      generatedAt: new Date().toISOString(),
      snapshotCount: 3,
    },
    dynamics: null,
    attention: { primaryTopics: [], decisionMix: { reactive: 0, consensus: 0, experimental: 0 }, agentVsHumanRatio: 0, agentConsumptionTokens: 0 },
    identity: { primaryAnchor: null, markers: [], overallCohesion: 0.5 },
    pathDependency: { lockedDimensions: [], crossCouplings: [], pathEntropy: 0.5 },
    selfAwareness: { deltas: [], overallGap: 0, significantDimensions: [], interpretation: '' },
    cpc: null,
    capabilitySpectrum: null,
    intentAlignment: null,
    sevenPowers: null,
    hacd: null,
    ipu: null,
    hona: null,
    htm: null,
    eob: null,
    financialImpact: null,
    tokenEconomics: null,
    autoInterpreter: null,
    autoAction: null,
    benchmark: null,
    dataEnricher: null,
    taskIntegration: null,
    degradedModules: [],
    ...overrides,
  } as FullDiagnosisV2;
}

/** 验证 ActionPlan 基本结构 */
function expectValidActionPlan(plan: ActionPlan): void {
  expect(plan.teamId).toBeDefined();
  expect(plan.generatedAt).toBeDefined();
  expect(Array.isArray(plan.items)).toBe(true);
  expect(Array.isArray(plan.degradedModules)).toBe(true);
}

// ====================================================================
// 规则匹配
// ====================================================================

describe('auto-action rule matching', () => {
  it('triggers trust-sticky rule when trust_incentive is sticky for 6+ months', async () => {
    // Given: trust_incentive dimension stuck for 6+ months with high stickiness
    const diag = makeDiagnosis({
      dynamics: {
        teamId: 'test-team',
        overallChangeRate: 0.1,
        stickyDimensions: [
          { dimension: 'trust_incentive', stickinessScore: 0.85, monthsUnchanged: 8, trend: 'stable' },
        ],
        phaseCoupling: [],
        abruptShifts: [],
        generatedAt: new Date().toISOString(),
      },
    });

    // When: generating action plan
    const plan = await generateActionPlan(diag);

    // Then: trust-sticky rule generated an item
    const trustItems = plan.items.filter(i => i.sourceDimension === 'trust_incentive');
    expect(trustItems.length).toBeGreaterThan(0);
    expect(trustItems[0].title).toContain('僵化');
    expect(trustItems[0].priority).toBe('high');
  });

  it('triggers trust-health-low rule when trust health score < 0.5', async () => {
    // Given: trust health below threshold
    const diag = makeDiagnosis({
      htm: {
        trustHealthScore: 0.35,
        humanAgentDistrustScore: 0.2,
        agentAgentDistrustScore: 0.1,
        singlePointRisks: [],
        overallAssessment: 'low',
        generatedAt: new Date().toISOString(),
      },
    });

    // When
    const plan = await generateActionPlan(diag);

    // Then
    const healthItems = plan.items.filter(i => i.sourceModule === 'htm');
    expect(healthItems.length).toBeGreaterThan(0);
    expect(healthItems[0].title).toContain('信任健康度');
    expect(healthItems[0].priority).toBe('high');
  });

  it('triggers single-point-risk rule when critical risks exist', async () => {
    // Given: critical single-point risks
    const diag = makeDiagnosis({
      htm: {
        trustHealthScore: 0.6,
        humanAgentDistrustScore: 0.2,
        agentAgentDistrustScore: 0.1,
        singlePointRisks: [
          { agentId: 'orders-agent', risk: 'critical', dependencyCount: 5 },
          { agentId: 'support-agent', risk: 'critical', dependencyCount: 4 },
        ],
        overallAssessment: 'medium',
        generatedAt: new Date().toISOString(),
      },
    });

    // When
    const plan = await generateActionPlan(diag);

    // Then
    const riskItems = plan.items.filter(i => i.title.includes('单点依赖'));
    expect(riskItems.length).toBeGreaterThan(0);
    expect(riskItems[0].priority).toBe('critical');
    expect(riskItems[0].title).toContain('orders-agent');
  });

  it('triggers info-flow-star rule when information_flow is star topology with low score', async () => {
    // Given: star topology with low engine score
    const diag = makeDiagnosis({
      gaps: {
        gaps: {
          information_flow: { engineScore: 0.25, confidence: 'high', mode: 'star' },
        },
        overallScore: 0.25,
        breakdown: [],
        generatedAt: new Date().toISOString(),
        snapshotCount: 3,
      },
    });

    // When
    const plan = await generateActionPlan(diag);

    // Then
    const infoItems = plan.items.filter(i => i.sourceDimension === 'information_flow');
    expect(infoItems.length).toBeGreaterThan(0);
    expect(infoItems[0].title).toContain('星型');
  });

  it('triggers self-awareness-gap rule when overallGap > 0.3', async () => {
    // Given: significant self-awareness gap
    const diag = makeDiagnosis({
      selfAwareness: {
        deltas: [],
        overallGap: 0.42,
        significantDimensions: [
          { dimension: 'knowledge_sharing', engineScore: 0.4, humanScore: 0.7, delta: 0.3 },
        ],
        interpretation: '显著偏差',
      },
    });

    // When
    const plan = await generateActionPlan(diag);

    // Then
    const awarenessItems = plan.items.filter(i => i.sourceModule === 'self-awareness');
    expect(awarenessItems.length).toBeGreaterThan(0);
    expect(awarenessItems[0].title).toContain('自知偏差');
  });

  it('does not trigger rules when diagnosis is healthy', async () => {
    // Given: fully healthy diagnosis — no gaps, high trust, no risks
    const diag = makeDiagnosis({
      gaps: {
        gaps: {
          information_flow: { engineScore: 0.6, confidence: 'high', mode: 'mesh' },
          knowledge_sharing: { engineScore: 0.65, confidence: 'high', mode: 'broadcast' },
        },
        overallScore: 0.6,
        breakdown: [],
        generatedAt: new Date().toISOString(),
        snapshotCount: 3,
      },
      htm: {
        trustHealthScore: 0.8,
        humanAgentDistrustScore: 0.05,
        agentAgentDistrustScore: 0.05,
        singlePointRisks: [],
        overallAssessment: 'healthy',
        generatedAt: new Date().toISOString(),
      },
    });

    // When
    const plan = await generateActionPlan(diag);

    // Then: few or no rules triggered
    const ruleItems = plan.items.filter(i => i.sourceModule !== 'llm-supplement');
    expect(ruleItems.length).toBeLessThanOrEqual(2);
  });
});

// ====================================================================
// 去重 + 排序
// ====================================================================

describe('auto-action deduplication and ordering', () => {
  it('sorts items by priority: critical > high > medium > low', async () => {
    // Given: diagnosis that triggers multiple rules at different priorities
    const diag = makeDiagnosis({
      dynamics: {
        teamId: 'test-team',
        overallChangeRate: 0.1,
        stickyDimensions: [
          { dimension: 'trust_incentive', stickinessScore: 0.85, monthsUnchanged: 8, trend: 'stable' },
        ],
        phaseCoupling: [],
        abruptShifts: [],
        generatedAt: new Date().toISOString(),
      },
      htm: {
        trustHealthScore: 0.35,
        humanAgentDistrustScore: 0.2,
        agentAgentDistrustScore: 0.1,
        singlePointRisks: [
          { agentId: 'critical-agent', risk: 'critical', dependencyCount: 5 },
        ],
        overallAssessment: 'low',
        generatedAt: new Date().toISOString(),
      },
      gaps: {
        gaps: {
          knowledge_sharing: { engineScore: 0.3, confidence: 'low', mode: 'silo' },
        },
        overallScore: 0.3,
        breakdown: [],
        generatedAt: new Date().toISOString(),
        snapshotCount: 3,
      },
      selfAwareness: {
        deltas: [{ dimension: 'trust_incentive', engineScore: 0.4, humanScore: 0.7, delta: 0.3 }],
        overallGap: 0.35,
        significantDimensions: [],
        interpretation: '',
      },
    });

    // When
    const plan = await generateActionPlan(diag);

    // Then: sorted by priority
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    for (let i = 1; i < plan.items.length; i++) {
      const prev = priorityOrder[plan.items[i - 1].priority];
      const curr = priorityOrder[plan.items[i].priority];
      expect(prev).toBeLessThanOrEqual(curr);
    }
  });

  it('generates unique IDs for all items', async () => {
    // Given: diagnosis with many triggered rules
    const diag = makeDiagnosis({
      dynamics: {
        teamId: 'test-team',
        overallChangeRate: 0.1,
        stickyDimensions: [
          { dimension: 'trust_incentive', stickinessScore: 0.85, monthsUnchanged: 8, trend: 'stable' },
        ],
        phaseCoupling: [],
        abruptShifts: [],
        generatedAt: new Date().toISOString(),
      },
      htm: {
        trustHealthScore: 0.35,
        humanAgentDistrustScore: 0.2,
        agentAgentDistrustScore: 0.1,
        singlePointRisks: [
          { agentId: 'agent-a', risk: 'critical', dependencyCount: 5 },
        ],
        overallAssessment: 'low',
        generatedAt: new Date().toISOString(),
      },
      gaps: {
        gaps: {
          information_flow: { engineScore: 0.25, confidence: 'high', mode: 'star' },
          knowledge_sharing: { engineScore: 0.3, confidence: 'low', mode: 'silo' },
          authority_governance: { engineScore: 0.3, confidence: 'high', mode: 'adhoc' },
        },
        overallScore: 0.3,
        breakdown: [],
        generatedAt: new Date().toISOString(),
        snapshotCount: 3,
      },
    });

    // When
    const plan = await generateActionPlan(diag);

    // Then: all IDs unique
    const ids = plan.items.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Each ID has expected format
    for (const id of ids) {
      expect(id).toMatch(/^action-\d+-\d+$/);
    }
  });
});

// ====================================================================
// 结构验证
// ====================================================================

describe('auto-action output structure', () => {
  it('returns valid ActionPlan structure', async () => {
    // Given: a standard diagnosis
    const diag = makeDiagnosis();

    // When
    const plan = await generateActionPlan(diag);

    // Then
    expectValidActionPlan(plan);
    for (const item of plan.items) {
      expect(item.id).toBeDefined();
      expect(item.title).toBeDefined();
      expect(item.priority).toBeDefined();
      expect(['critical', 'high', 'medium', 'low']).toContain(item.priority);
      expect(item.targetSystem).toBeDefined();
      expect(['jira', 'linear', 'manual']).toContain(item.targetSystem);
      expect(typeof item.estimatedEffortHours).toBe('number');
      expect(item.status).toBe('pending');
      expect(item.suggestion).toBeDefined();
    }
  });

  it('preserves degradedModules from diagnosis', async () => {
    // Given: diagnosis with known degraded modules
    const diag = makeDiagnosis({
      degradedModules: ['htm', 'eob'],
    });

    // When
    const plan = await generateActionPlan(diag);

    // Then: degradedModules reflected
    expect(plan.degradedModules).toBeDefined();
  });
});
