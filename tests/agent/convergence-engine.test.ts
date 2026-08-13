/**
 * tests/agent/convergence-engine.test.ts — D8f 收敛机制测试 (v2 四步算法)
 */
import { describe, it, expect, vi } from 'vitest';

describe('ConvergenceEngine — synthesize', () => {
  it('合成3个专家响应 → ConvergedSynthesis + narrative', async () => {
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
    expect(result.convergentFindings.length).toBeGreaterThanOrEqual(3);
    expect(result.expertContributions).toHaveLength(3);
    expect(result.narrative).toBeTruthy();
    expect(result.narrative.length).toBeGreaterThan(0);
  });

  it('空输入 → 空结果 + 空 narrative', async () => {
    const { ConvergenceEngine } = await import('../../src/agent/convergence-engine');
    const engine = new ConvergenceEngine();
    const result = engine.synthesize([], { conflicts: [], tieBreakers: [], consensus: 'none' }, []);
    expect(result.expertContributions).toHaveLength(0);
    expect(result.narrative).toBe('');
  });
});

describe('四步收敛 — findConsensus', () => {
  it('3 专家同一边 → 返回共识', async () => {
    const { ConvergenceEngine } = await import('../../src/agent/convergence-engine');
    const engine = new ConvergenceEngine();
    const r = engine.findConsensus([
      { subTaskId: '1', expertType: 'finance', analysis: '利润偏低需调整', confidence: 0.8, evidence: ['F1'], edgeIds: ['E-23'], degraded: false, durationMs: 0 },
      { subTaskId: '2', expertType: 'strategy', analysis: '利润率偏低问题', confidence: 0.7, evidence: ['F2'], edgeIds: ['E-23'], degraded: false, durationMs: 0 },
      { subTaskId: '3', expertType: 'org', analysis: '利润异常需关注', confidence: 0.6, evidence: ['F3'], edgeIds: ['E-23'], degraded: false, durationMs: 0 },
    ]);
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0].edgeId).toBe('E-23');
    expect(r[0].expertCount).toBe(3);
    expect(typeof r[0].averageSimilarity).toBe('number');
    expect(typeof r[0].medianConfidence).toBe('number');
  });

  it('空输入 → 空结果', async () => {
    const { ConvergenceEngine } = await import('../../src/agent/convergence-engine');
    const engine = new ConvergenceEngine();
    expect(engine.findConsensus([])).toHaveLength(0);
  });
});

describe('四步收敛 — quantifyDivergence', () => {
  it('高方差 → 返回差异', async () => {
    const { ConvergenceEngine } = await import('../../src/agent/convergence-engine');
    const engine = new ConvergenceEngine();
    const r = engine.quantifyDivergence([
      { subTaskId: '1', expertType: 'finance', analysis: 'a', confidence: 0.9, evidence: [], edgeIds: [], degraded: false, durationMs: 0 },
      { subTaskId: '2', expertType: 'finance', analysis: 'b', confidence: 0.2, evidence: [], edgeIds: [], degraded: false, durationMs: 0 },
    ]);
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(typeof r[0].confidenceVariance).toBe('number');
  });

  it('单个专家 → 空结果', async () => {
    const { ConvergenceEngine } = await import('../../src/agent/convergence-engine');
    const engine = new ConvergenceEngine();
    expect(engine.quantifyDivergence([])).toHaveLength(0);
  });
});

describe('四步收敛 — weightContributions', () => {
  it('GA 准确率影响权重', async () => {
    const { ConvergenceEngine } = await import('../../src/agent/convergence-engine');
    const engine = new ConvergenceEngine(null, [
      { expertType: 'finance', historicalAccuracy: 0.9, reviewCount: 50 },
      { expertType: 'strategy', historicalAccuracy: 0.5, reviewCount: 10 },
    ]);
    const r = engine.weightContributions([
      { subTaskId: '1', expertType: 'finance', analysis: 'x', confidence: 0.8, evidence: [], edgeIds: [], degraded: false, durationMs: 0 },
      { subTaskId: '2', expertType: 'strategy', analysis: 'y', confidence: 0.8, evidence: [], edgeIds: [], degraded: false, durationMs: 0 },
    ]);
    expect(r).toHaveLength(2);
    expect(typeof r[0].weight).toBe('number');
  });

  it('无 GA 数据 → 等权', async () => {
    const { ConvergenceEngine } = await import('../../src/agent/convergence-engine');
    const engine = new ConvergenceEngine();
    const r = engine.weightContributions([
      { subTaskId: '1', expertType: 'finance', analysis: 'x', confidence: 0.8, evidence: [], edgeIds: [], degraded: false, durationMs: 0 },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].weight).toBe(0.8);
  });
});

describe('四步收敛 — buildSynthesisMatrix', () => {
  it('包含专家和边', async () => {
    const { ConvergenceEngine } = await import('../../src/agent/convergence-engine');
    const engine = new ConvergenceEngine();
    const m = engine.buildSynthesisMatrix(
      [{ subTaskId: '1', expertType: 'finance', analysis: 'x', confidence: 0.8, evidence: ['F1'], edgeIds: ['E-23'], degraded: false, durationMs: 0 }],
      [], [],
      [{ expertType: 'finance', weight: 0.8, keyInsight: 'x' }],
    );
    expect(m.totalExperts).toBe(1);
    expect(m.totalEdges).toBe(1);
    expect(m.experts[0].type).toBe('finance');
  });
});

describe('Convergence rules', () => {
  it('≥3 次一致 → 收敛规则', async () => {
    const { ConvergenceEngine } = await import('../../src/agent/convergence-engine');
    const engine = new ConvergenceEngine();
    engine.addRule(['finance', 'strategy'], 'E-23', 'finance', 3);
    const rule = engine.getConvergence('E-23', ['finance', 'strategy']);
    expect(rule).not.toBeNull();
    expect(rule!.winner).toBe('finance');
    expect(rule!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('无规则 → null', async () => {
    const { ConvergenceEngine } = await import('../../src/agent/convergence-engine');
    const engine = new ConvergenceEngine();
    expect(engine.getConvergence('E-99', ['finance', 'strategy'])).toBeNull();
  });
});
