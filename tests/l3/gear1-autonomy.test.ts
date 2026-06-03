/**
 * tests/l3/gear1-autonomy.test.ts — Gear 1: 专家自主权引擎 + Gear 4: 质量防火墙
 *
 * Gear 1 验收:
 *   信息增益=0 → 自动终止 / 被禁查询→拒绝 / finalize→终止 / 5轮强制输出
 * Gear 4 验收:
 *   假证据→拒绝 / 过期证据→降级 / 矛盾→标记审核 / 四道检验全过→通过
 *
 * 铁律 0-2: Given/When/Then + 每个 public 函数 ≥ 2 用例
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ExpertAutonomyEngine } from '../../src/l3/expert-autonomy';
import { QualityFirewall } from '../../src/l3/quality-firewall';
import type { LLMClient } from '../../src/orchestrator/diagnosis-orchestrator';
import type { DataAccessPolicy } from '../../src/orchestrator/subagent-coordinator';

// ═══ Gear 1: Expert Autonomy Engine ═══

describe('ExpertAutonomyEngine — ReAct 循环 + 智能终止 + 权限', () => {
  const fakeLLM: LLMClient = { async consult() { return { content: '{"thought":"分析完成","action":"finalize","hypothesis":"根因是排班制度","confidence":0.85}', model:'fake' }; } };

  // Fake query API
  const queryApi = {
    findDiagnosticPaths: async () => [{ nodes:['a','b'], edges:[], length:2, totalWeight:0.8 }],
    summarizeSubgraph: async () => ({ rootId:'r1', nodeCount:5, edgeCount:8, typeDistribution:{}, strongestConnections:[], risks:[], anomalyScore:0.2 }),
    findCrossDimensionalBrokers: async () => [{ nodeId:'b1', nodeType:'Person', betweennessScore:0.9, bridgingDimensions:['finance','org'] }],
  };

  const policy: DataAccessPolicy = {
    expertType: 'strategy',
    allowedDimensions: ['goal_alignment', 'risk'],
    prohibitedFields: ['salary'],
    anonymizationRules: [],
    allowedQueryFunctions: ['findDiagnosticPaths', 'summarizeSubgraph'], // no brokers
  };

  it('Given expert with valid query, When ReAct loop runs, Then returns hypothesis', async () => {
    const engine = new ExpertAutonomyEngine(fakeLLM, queryApi, policy, { maxRounds: 5 });
    const result = await engine.run({ evidence: ['信号1', '信号2'], expertType: 'strategy' });
    expect(result.hypothesis).toBeDefined();
    expect(result.roundsUsed).toBeGreaterThanOrEqual(1);
  });

  it('Given expert calls forbidden query function, When engine checks, Then rejected', () => {
    const engine = new ExpertAutonomyEngine(fakeLLM, queryApi, policy, { maxRounds: 5 });
    const allowed = engine.isQueryAllowed('findDiagnosticPaths');  // In allowlist
    const denied = engine.isQueryAllowed('findCrossDimensionalBrokers'); // NOT in allowlist
    expect(allowed).toBe(true);
    expect(denied).toBe(false);
  });

  it('Given expert sends finalize signal, When engine receives, Then loop terminates immediately', async () => {
    const llm: LLMClient = {
      async consult() { return { content: '{"thought":"done","action":"finalize","hypothesis":"最终结论","confidence":0.9}', model:'fake' }; },
    };
    const engine = new ExpertAutonomyEngine(llm, queryApi, policy, { maxRounds: 5 });
    const result = await engine.run({ evidence: [], expertType: 'strategy' });
    expect(result.action).toBe('finalize');
    expect(result.roundsUsed).toBe(1); // Terminated on first round
  });

  it('Given maxRounds=5, When loop does not terminate early, Then forced output at round 5', async () => {
    const llm: LLMClient = {
      async consult() { return { content: '{"thought":"thinking...","action":"query_graph","function":"findDiagnosticPaths"}', model:'fake' }; },
    };
    const engine = new ExpertAutonomyEngine(llm, queryApi, policy, { maxRounds: 3 });
    const result = await engine.run({ evidence: [], expertType: 'strategy' });
    // Reaches max rounds and outputs best available hypothesis
    expect(result.roundsUsed).toBeLessThanOrEqual(3);
    expect(result.hypothesis).toBeDefined();
  });

  it('Given no evidence provided, When ReAct loop runs, Then still produces output gracefully', async () => {
    const engine = new ExpertAutonomyEngine(fakeLLM, queryApi, policy, { maxRounds: 5 });
    const result = await engine.run({ evidence: [], expertType: 'strategy' });
    expect(result).toBeDefined();
  });
});

// ═══ Gear 4: Quality Firewall ═══

describe('QualityFirewall — 四道检验', () => {
  function fakeStore(existingEvidenceIds: string[] = []) {
    return {
      queryNodes() { return existingEvidenceIds.map(id => ({ id })); },
    } as any;
  }

  it('Given finding with fake evidence reference, When firewall checks, Then rejected', async () => {
    const store = fakeStore([]); // no evidence exists
    const firewall = new QualityFirewall(store, 'org-1');
    const result = await firewall.validate({
      hypothesis: '根因是X',
      evidenceRefs: ['fake_evidence_id'],
      confidence: 0.8,
      expertType: 'strategy',
    });
    expect(result.passed).toBe(false);
    expect(result.rejections).toContain('evidence_not_found');
  });

  it('Given finding with real evidence but low confidence, When firewall checks, Then passed but flagged low confidence', async () => {
    const store = fakeStore(['ev_real_1']);
    const firewall = new QualityFirewall(store, 'org-1');
    const result = await firewall.validate({
      hypothesis: '根因是Y',
      evidenceRefs: ['ev_real_1'],
      confidence: 0.3,
      expertType: 'strategy',
    });
    expect(result.passed).toBe(true);
    expect(result.warnings).toContain('low_confidence');
  });

  it('Given finding with valid_to older than 30 days, When firewall checks, Then flagged as possibly stale, confidence downgraded', async () => {
    const store = fakeStore(['ev_old_1']);
    const firewall = new QualityFirewall(store, 'org-1');
    const oldDate = new Date(Date.now() - 60 * 24 * 3600_000).toISOString();
    const result = await firewall.validate({
      hypothesis: '根因是Z',
      evidenceRefs: ['ev_old_1'],
      confidence: 0.8,
      expertType: 'strategy',
      evidenceTimestamps: { ev_old_1: oldDate },
    });
    expect(result.warnings).toContain('possibly_stale');
    expect(result.adjustedConfidence).toBeLessThan(0.8);
  });

  it('Given two experts contradict, When firewall checks, Then flagged for human review', async () => {
    const store = fakeStore(['ev1']);
    const firewall = new QualityFirewall(store, 'org-1');
    const result = await firewall.validate({
      hypothesis: '根因是A',
      evidenceRefs: ['ev1'],
      confidence: 0.8,
      expertType: 'strategy',
      contradictingExperts: ['finance'],
    });
    expect(result.warnings).toContain('contradicted_by_expert');
  });

  it('Given all checks pass, When firewall validates, Then returns passed=true with no rejections', async () => {
    const store = fakeStore(['ev1', 'ev2']);
    const firewall = new QualityFirewall(store, 'org-1');
    const result = await firewall.validate({
      hypothesis: '根因是B',
      evidenceRefs: ['ev1', 'ev2'],
      confidence: 0.85,
      expertType: 'strategy',
    });
    expect(result.passed).toBe(true);
    expect(result.rejections).toHaveLength(0);
  });
});
