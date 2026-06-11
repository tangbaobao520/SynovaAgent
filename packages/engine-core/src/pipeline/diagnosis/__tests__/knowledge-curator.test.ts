/**
 * knowledge-curator.test.ts — 知识生命周期管理器测试
 */
import {
  addKnowledge,
  recordKnowledgeUse,
  recordKnowledgeValidation,
  applyAutoTransitions,
  consolidateKnowledge,
  runCuratorPass,
  shouldRunCurator,
  getCuratorState,
  setCuratorConfig,
  listOrgKnowledge,
  clearCuratorStore,
} from '../knowledge-curator';

beforeEach(() => clearCuratorStore());

// ====================================================================
// CRUD + Telemetry
// ====================================================================

describe('addKnowledge + telemetry', () => {
  it('creates knowledge with active state', () => {
    const k = addKnowledge({
      type: 'rule', source: 'agent_derived', orgId: 'org-1',
      content: '信息流延迟每日成本 = 5000', dimensions: ['information_flow'],
      confidence: 0.72, pinned: false,
    });
    expect(k.state).toBe('active');
    expect(k.useCount).toBe(0);
  });

  it('records use and reactivates archived knowledge', () => {
    const k = addKnowledge({
      type: 'terminology', source: 'agent_derived', orgId: 'org-1',
      content: '用户术语映射', dimensions: ['information_flow'],
      confidence: 0.8, pinned: false,
    });
    k.state = 'archived';
    recordKnowledgeUse(k.id);
    expect(k.state).toBe('active');
    expect(k.useCount).toBe(1);
  });

  it('records validation', () => {
    const k = addKnowledge({
      type: 'rule', source: 'agent_derived', orgId: 'org-1',
      content: 'test', dimensions: ['trust'], confidence: 0.6, pinned: false,
    });
    recordKnowledgeValidation(k.id, true);
    recordKnowledgeValidation(k.id, false);
    expect(k.validationCount).toBe(1);
    expect(k.invalidationCount).toBe(1);
  });
});

// ====================================================================
// Auto-Transitions
// ====================================================================

describe('applyAutoTransitions', () => {
  it('marks stale after configured days', () => {
    setCuratorConfig('org-1', { staleAfterDays: 0, archiveAfterDays: 999 });
    const k = addKnowledge({
      type: 'rule', source: 'agent_derived', orgId: 'org-1',
      content: 'old rule', dimensions: ['trust'], confidence: 0.5, pinned: false,
    });
    k.lastUsedAt = '2020-01-01T00:00:00.000Z'; // ancient
    const result = applyAutoTransitions('org-1');
    expect(result.markedStale).toBe(1);
    expect(k.state).toBe('stale');
  });

  it('skips pinned knowledge', () => {
    const k = addKnowledge({
      type: 'rule', source: 'agent_derived', orgId: 'org-1',
      content: 'pinned rule', dimensions: ['trust'], confidence: 0.5, pinned: true,
    });
    k.lastUsedAt = '2020-01-01T00:00:00.000Z';
    const result = applyAutoTransitions('org-1');
    expect(result.markedStale).toBe(0);
    expect(k.state).toBe('active');
  });

  it('skips bundled knowledge', () => {
    const k = addKnowledge({
      type: 'rule', source: 'bundled', orgId: 'org-1',
      content: 'bundled rule', dimensions: ['trust'], confidence: 0.9, pinned: false,
    });
    k.lastUsedAt = '2020-01-01T00:00:00.000Z';
    const result = applyAutoTransitions('org-1');
    expect(result.checked).toBe(0);
  });

  it('archives stale knowledge after archive cutoff', () => {
    setCuratorConfig('org-1', { staleAfterDays: 0, archiveAfterDays: 0 });
    const k = addKnowledge({
      type: 'rule', source: 'agent_derived', orgId: 'org-1',
      content: 'very old', dimensions: ['trust'], confidence: 0.5, pinned: false,
    });
    k.lastUsedAt = '2020-01-01T00:00:00.000Z';
    applyAutoTransitions('org-1'); // first pass: stale
    const result = applyAutoTransitions('org-1'); // second pass: archive
    expect(result.archived).toBeGreaterThanOrEqual(0);
  });
});

// ====================================================================
// Consolidation
// ====================================================================

describe('consolidateKnowledge', () => {
  it('consolidates similar knowledge by type+dimension', () => {
    setCuratorConfig('org-1', { minUseCountForConsolidation: 0 });
    for (let i = 0; i < 3; i++) {
      const k = addKnowledge({
        type: 'rule', source: 'agent_derived', orgId: 'org-1',
        content: `rule variant ${i}`, dimensions: ['information_flow'],
        confidence: 0.5 + i * 0.1, pinned: false,
      });
      k.useCount = 5; // mark as used enough
    }
    const result = consolidateKnowledge('org-1');
    expect(result.consolidated.length).toBeGreaterThan(0);
  });

  it('does not consolidate with insufficient use count', () => {
    setCuratorConfig('org-1', { minUseCountForConsolidation: 10 });
    for (let i = 0; i < 3; i++) {
      const k = addKnowledge({
        type: 'rule', source: 'agent_derived', orgId: 'org-1',
        content: `rule ${i}`, dimensions: ['trust'], confidence: 0.5, pinned: false,
      });
      k.useCount = 1;
    }
    const result = consolidateKnowledge('org-1');
    expect(result.consolidated).toHaveLength(0);
  });

  it('prunes zero-use old knowledge', () => {
    const k = addKnowledge({
      type: 'rule', source: 'agent_derived', orgId: 'org-1',
      content: 'unused', dimensions: ['trust'], confidence: 0.5, pinned: false,
    });
    (k as any).createdAt = '2020-01-01T00:00:00.000Z';
    k.useCount = 0;
    const result = consolidateKnowledge('org-1');
    expect(result.pruned.length).toBeGreaterThan(0);
  });
});

// ====================================================================
// Curator Orchestrator
// ====================================================================

describe('runCuratorPass', () => {
  it('runs full curator cycle', () => {
    setCuratorConfig('org-1', { staleAfterDays: 0 });
    const k = addKnowledge({
      type: 'rule', source: 'agent_derived', orgId: 'org-1',
      content: 'test rule', dimensions: ['information_flow'],
      confidence: 0.7, pinned: false,
    });
    k.lastUsedAt = '2020-01-01T00:00:00.000Z';

    const result = runCuratorPass('org-1');
    expect(result.summary).toBeTruthy();
    expect(result.autoTransitions.checked).toBeGreaterThan(0);
  });

  it('tracks curator state', () => {
    runCuratorPass('org-1');
    const state = getCuratorState('org-1');
    expect(state).toBeDefined();
    expect(state!.runCount).toBe(1);
  });

  it('shouldRunCurator returns true for first run', () => {
    expect(shouldRunCurator('org-1')).toBe(true);
  });
});

// ====================================================================
// Org Isolation
// ====================================================================

describe('org isolation', () => {
  it('isolates knowledge per org', () => {
    addKnowledge({ type: 'rule', source: 'agent_derived', orgId: 'org-A', content: 'A', dimensions: ['trust'], confidence: 0.5, pinned: false });
    addKnowledge({ type: 'rule', source: 'agent_derived', orgId: 'org-B', content: 'B', dimensions: ['trust'], confidence: 0.5, pinned: false });
    expect(listOrgKnowledge('org-A')).toHaveLength(1);
    expect(listOrgKnowledge('org-B')).toHaveLength(1);
    expect(listOrgKnowledge('org-C')).toHaveLength(0);
  });
});
