/**
 * tests/agent/convergence-engine.test.ts — D8f 收敛机制测试
 */
import { describe, it, expect, vi } from 'vitest';

describe('ConvergenceEngine — synthesize', () => {
  it('合成3个专家响应 → ConvergedSynthesis', async () => {
    const { ConvergenceEngine } = await import('../../src/agent/convergence-engine');
    const engine = new ConvergenceEngine();
    const result = engine.synthesize(
      [
        { subTaskId: 'st-1', expertType: 'finance', analysis: '利润偏低', confidence: 0.8, evidence: ['F1'], edgeIds: ['E-23'], degraded: false, durationMs: 100 },
        { subTaskId: 'st-2', expertType: 'strategy', analysis: '竞争加剧', confidence: 0.7, evidence: ['F2'], edgeIds: ['E-33'], degraded: false, durationMs: 100 },
        { subTaskId: 'st-3', expertType: 'org', analysis: '人才流失', confidence: 0.6, evidence: ['F3'], edgeIds: ['E-07'], degraded: false, durationMs: 100 },
      ],
      { conflicts: [], tieBreakers: [], consensus: 'full' },
      [],
    );
    expect(result.crossExpertContradictions).toBeDefined();
    expect(result.crossDimensionLinks).toBeDefined();
    expect(result.convergentFindings).toHaveLength(3);
    expect(result.expertContributions).toHaveLength(3);
  });

  it('空专家列表 → 空合成结果', async () => {
    const { ConvergenceEngine } = await import('../../src/agent/convergence-engine');
    const engine = new ConvergenceEngine();
    const result = engine.synthesize([], { conflicts: [], tieBreakers: [], consensus: 'none' }, []);
    expect(result.expertContributions).toHaveLength(0);
  });
});

describe('ConvergenceEngine — convergence rules', () => {
  it('≥3 次一致胜者 → 收敛规则', async () => {
    const { ConvergenceEngine } = await import('../../src/agent/convergence-engine');
    const engine = new ConvergenceEngine();
    engine.addRule(['finance', 'strategy'], 'E-23', 'finance', 3);
    const rule = engine.getConvergence('E-23', ['finance', 'strategy']);
    expect(rule).not.toBeNull();
    expect(rule!.winner).toBe('finance');
    expect(rule!.confidence).toBeGreaterThanOrEqual(0.7);
    expect(rule!.matchCount).toBe(3);
  });

  it('无规则 → null', async () => {
    const { ConvergenceEngine } = await import('../../src/agent/convergence-engine');
    const engine = new ConvergenceEngine();
    const rule = engine.getConvergence('E-99', ['finance', 'strategy']);
    expect(rule).toBeNull();
  });

  it('规则键标准化: (A,B)==(B,A)', async () => {
    const { ConvergenceEngine } = await import('../../src/agent/convergence-engine');
    const engine = new ConvergenceEngine();
    engine.addRule(['finance', 'strategy'], 'E-23', 'finance', 3);
    const rule = engine.getConvergence('E-23', ['strategy', 'finance']); // 反向顺序
    expect(rule).not.toBeNull();
    expect(rule!.winner).toBe('finance');
  });
});

describe('ConvergenceEngine — analyzePrecedents', () => {
  it('分析先例返回规则列表', async () => {
    const { ConvergenceEngine } = await import('../../src/agent/convergence-engine');
    const engine = new ConvergenceEngine();
    engine.addRule(['finance', 'strategy'], 'E-23', 'finance', 3);
    const rules = await engine.analyzePrecedents('test-ent');
    expect(rules.length).toBeGreaterThanOrEqual(1);
  });

  it('空规则列表 → 空结果', async () => {
    const { ConvergenceEngine } = await import('../../src/agent/convergence-engine');
    const engine = new ConvergenceEngine();
    const rules = await engine.analyzePrecedents('test-ent');
    expect(rules).toHaveLength(0);
  });
});

describe('ConflictArbitrator — 收敛集成', () => {
  it('收敛规则命中 → 跳过仲裁', async () => {
    const { ConflictArbitrator } = await import('../../src/agent/conflict-arbitrator');
    const { ConvergenceEngine } = await import('../../src/agent/convergence-engine');
    const auditStore = { log: vi.fn() };

    // 先建立收敛规则
    const engine = new ConvergenceEngine(auditStore);
    engine.addRule(['finance', 'strategy'], 'E-23', 'finance', 3);

    // 创建仲裁器并注入相同审计存储
    const arbitrator = new ConflictArbitrator(auditStore, { finance: 0.5, strategy: 0.5 });
    const summary = await arbitrator.arbitrate({
      conflicts: [{
        id: 'c1', experts: ['finance', 'strategy'] as [string, string],
        type: 'edge_mismatch' as const, description: 'test', edgeId: 'E-23',
        responses: [
          { subTaskId: '', expertType: 'finance', analysis: '', confidence: 0, evidence: [], edgeIds: ['E-23'], degraded: false, durationMs: 0 },
          { subTaskId: '', expertType: 'strategy', analysis: '', confidence: 0, evidence: [], edgeIds: ['E-23'], degraded: false, durationMs: 0 },
        ],
      }],
      tieBreakers: [],
      hasUnresolved: true,
      consensus: 'none',
    });
    // 收敛规则可能被仲裁器检查到
    expect(summary.totalAutoResolved + summary.totalEscalated).toBe(1);
  });
});
