/**
 * tests/agent/cross-validator.test.ts — D8d 交叉验证触发器测试
 */
import { describe, it, expect, vi } from 'vitest';
import type { ExpertResponse } from '../../src/agent/expert-router';

function makeExpertResponse(overrides?: Partial<ExpertResponse>): ExpertResponse {
  return {
    subTaskId: 'st-1', expertType: 'finance', analysis: '正常分析结果', confidence: 0.8,
    evidence: ['F1'], edgeIds: ['E-23'], degraded: false, durationMs: 100,
    ...overrides,
  };
}

describe('detectConflicts — 冲突检测', () => {
  it('2 专家对同一 edge 分析一致 → 无冲突', async () => {
    const { CrossValidationTrigger } = await import('../../src/agent/cross-validator');
    const validator = new CrossValidationTrigger();
    const result = validator.detectConflicts([
      makeExpertResponse({ expertType: 'finance', edgeIds: ['E-23'] }),
      makeExpertResponse({ expertType: 'strategy', edgeIds: ['E-23'] }),
    ]);
    expect(result).toHaveLength(0);
  });

  it('2 专家对不同 edge → 无冲突', async () => {
    const { CrossValidationTrigger } = await import('../../src/agent/cross-validator');
    const validator = new CrossValidationTrigger();
    const result = validator.detectConflicts([
      makeExpertResponse({ expertType: 'finance', edgeIds: ['E-23'] }),
      makeExpertResponse({ expertType: 'strategy', edgeIds: ['E-05'] }),
    ]);
    // 不同的 edge — 非共享，不构成冲突
    expect(result).toHaveLength(0);
  });

  it('共享 evidence + 严重度相反 → 冲突', async () => {
    const { CrossValidationTrigger } = await import('../../src/agent/cross-validator');
    const validator = new CrossValidationTrigger();
    // 共享 evidence F1 + 分析文本包含严重度关键词相反
    const result = validator.detectConflicts([
      makeExpertResponse({ expertType: 'finance', evidence: ['F1'], analysis: 'critical 严重问题' }),
      makeExpertResponse({ expertType: 'strategy', evidence: ['F1'], analysis: 'info 正常情况' }),
    ]);
    // 共享 evidence + 严重度相反 → 冲突
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].type).toBe('severity_opposite');
  });

  it('空响应 → 空冲突', async () => {
    const { CrossValidationTrigger } = await import('../../src/agent/cross-validator');
    const validator = new CrossValidationTrigger();
    const result = validator.detectConflicts([]);
    expect(result).toHaveLength(0);
  });

  it('单个响应 → 空冲突', async () => {
    const { CrossValidationTrigger } = await import('../../src/agent/cross-validator');
    const validator = new CrossValidationTrigger();
    const result = validator.detectConflicts([makeExpertResponse()]);
    expect(result).toHaveLength(0);
  });
});

describe('triggerTieBreaker — 裁决', () => {
  it('有效冲突 → 返回裁决结果', async () => {
    const { CrossValidationTrigger } = await import('../../src/agent/cross-validator');
    const validator = new CrossValidationTrigger();
    const conflict = {
      id: 'conflict-1',
      experts: ['finance', 'strategy'] as [string, string],
      type: 'edge_mismatch' as const,
      description: 'test',
      responses: [
        makeExpertResponse({ expertType: 'finance', edgeIds: ['E-23'] }),
        makeExpertResponse({ expertType: 'strategy', edgeIds: ['E-05'] }),
      ] as [ExpertResponse, ExpertResponse],
    };
    const result = await validator.triggerTieBreaker(conflict);
    expect(result.conflictId).toBe('conflict-1');
    expect(result.tieBreakerExpert).toBeTruthy();
    expect(result.tieBreakerExpert).not.toBe('finance');
    expect(result.tieBreakerExpert).not.toBe('strategy');
    expect(result.consensusExperts).toHaveLength(3);
  });
});

describe('aggregate — 聚合', () => {
  it('无冲突 → full', async () => {
    const { CrossValidationTrigger } = await import('../../src/agent/cross-validator');
    const validator = new CrossValidationTrigger();
    const result = validator.aggregate([
      makeExpertResponse({ expertType: 'finance' }),
      makeExpertResponse({ expertType: 'strategy' }),
    ], []);
    expect(result.consensus).toBe('full');
    expect(result.degraded).toBe(false);
  });

  it('共享 evidence + 严重度相反 → 冲突 + degraded', async () => {
    const { CrossValidationTrigger } = await import('../../src/agent/cross-validator');
    const validator = new CrossValidationTrigger();
    // 共享 evidence + 严重度关键词相反
    const responses = [
      makeExpertResponse({ expertType: 'finance', evidence: ['F1'], analysis: 'critical 严重问题' }),
      makeExpertResponse({ expertType: 'strategy', evidence: ['F1'], analysis: 'info 正常情况' }),
    ];
    const result = validator.aggregate(responses, []);
    expect(result.conflicts.length).toBeGreaterThanOrEqual(1);
    expect(result.degraded).toBe(true);
  });
});
