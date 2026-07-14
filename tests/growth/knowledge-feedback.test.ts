/**
 * tests/growth/knowledge-feedback.test.ts — D76 执行知识 PKB 回流测试
 */
import { describe, it, expect, vi } from 'vitest';
import type { Goal } from '../../src/growth/goal-types';

function makeGoal(overrides?: Partial<Goal>): Goal {
  return {
    goalId: 'goal-1',
    orgId: 'org-1',
    proposalId: 'prop-1',
    diagnosisId: 'diag-1',
    title: '提高净利润率',
    description: '将净利润率从 5% 提升到 8%',
    priority: 'P1',
    status: 'active',
    ownerDeptId: 'finance',
    assignedTo: '张三',
    createdAt: new Date(Date.now() - 90 * 86400000).toISOString(),
    deadline: new Date(Date.now() + 30 * 86400000).toISOString(),
    metrics: [
      { metricName: '净利润率', currentValue: 5, targetValue: 8, unit: '%', computeContractId: 'test' },
    ],
    successCriteria: [{ criterion: '净利润率 ≥ 8%', verificationMethod: 'metric_threshold', verified: false }],
    dependsOn: [],
    conflictsWith: [],
    reDiagnosisCount: 0,
    createdBy: { role: 'manager' },
    lastModifiedAt: new Date().toISOString(),
    plannedDurationDays: 120,
    rootCause: undefined,
    ...overrides,
  };
}

describe('classifyDeviation — 6条判定规则', () => {
  it('规则1: 单次偏离 > 50% → external_shock', async () => {
    const { extractGoalKnowledge } = await import('../../src/growth/knowledge-feedback');
    const result = extractGoalKnowledge(
      makeGoal(), 'not_achieved',
      [{ metricName: '净利润率', target: 8, actual: 2, met: false }],
    );
    expect(result.deviationClassifier).toBe('external_shock');
    expect(result.deviationConfidence).toBeGreaterThanOrEqual(0.5);
  });

  it('规则2: 多次 degraded 且未达标 → measurement_error', async () => {
    const { extractGoalKnowledge } = await import('../../src/growth/knowledge-feedback');
    const result = extractGoalKnowledge(
      makeGoal({ reDiagnosisCount: 2 }), 'not_achieved',
      [{ metricName: '净利润率', target: 8, actual: 6, met: false }],
    );
    expect(result.deviationClassifier).toBe('measurement_error');
    expect(result.deviationReason).toContain('再诊断');
  });

  it('规则3: 未达标且行业同步下降 → market_change', async () => {
    const { extractGoalKnowledge } = await import('../../src/growth/knowledge-feedback');
    const result = extractGoalKnowledge(
      makeGoal(), 'not_achieved',
      [{ metricName: '净利润率', target: 8, actual: 6, met: false }],
      'retail', -0.1,
    );
    expect(result.deviationClassifier).toBe('market_change');
  });

  it('规则4: 未达标且 baseline 已预警 → target_too_high', async () => {
    const { extractGoalKnowledge } = await import('../../src/growth/knowledge-feedback');
    const result = extractGoalKnowledge(
      makeGoal({ rootCause: '成本结构刚性' }), 'not_achieved',
      [{ metricName: '净利润率', target: 8, actual: 6, met: false }],
    );
    expect(result.deviationClassifier).toBe('target_too_high');
    expect(result.deviationReason).toContain('成本结构刚性');
  });

  it('规则5: 未达标且无其他匹配 → execution_failure', async () => {
    const { extractGoalKnowledge } = await import('../../src/growth/knowledge-feedback');
    const result = extractGoalKnowledge(
      makeGoal(), 'not_achieved',
      [{ metricName: '净利润率', target: 8, actual: 7, met: false }],
    );
    expect(result.deviationClassifier).toBe('execution_failure');
  });

  it('规则6: 超额 > 30% → target_too_low', async () => {
    const { extractGoalKnowledge } = await import('../../src/growth/knowledge-feedback');
    const result = extractGoalKnowledge(
      makeGoal(), 'achieved',
      [{ metricName: '净利润率', target: 8, actual: 12, met: true }],
    );
    expect(result.deviationClassifier).toBe('target_too_low');
  });
});

describe('extractGoalKnowledge — 知识提取', () => {
  it('正常提取 14 字段知识条目', async () => {
    const { extractGoalKnowledge } = await import('../../src/growth/knowledge-feedback');
    const goal = makeGoal();
    const knowledge = extractGoalKnowledge(goal, 'not_achieved', [
      { metricName: '净利润率', target: 8, actual: 6, met: false },
    ], 'retail');
    expect(knowledge.goalId).toBe('goal-1');
    expect(knowledge.goalTitle).toBe('提高净利润率');
    expect(knowledge.dimension).toBe('financial');
    expect(knowledge.industry).toBe('retail');
    expect(knowledge.outcome).toBe('not_achieved');
    expect(knowledge.deviationClassifier).toBeTruthy();
    expect(knowledge.deviationConfidence).toBeGreaterThan(0);
    expect(knowledge.metricChain.length).toBe(1);
    expect(knowledge.metricChain[0].deviation).toBeLessThan(0);
    expect(knowledge.lessons.length).toBeGreaterThan(0);
    expect(knowledge.reusableAdvice.length).toBeGreaterThan(0);
    expect(knowledge.createdAt).toBeTruthy();
  });

  it('achieved 状态提取正常', async () => {
    const { extractGoalKnowledge } = await import('../../src/growth/knowledge-feedback');
    const goal = makeGoal();
    const knowledge = extractGoalKnowledge(goal, 'achieved', [
      { metricName: '净利润率', target: 8, actual: 9, met: true },
    ]);
    expect(knowledge.outcome).toBe('achieved');
    expect(knowledge.metricChain[0].deviation).toBeGreaterThan(0);
  });
});

describe('writeGoalKnowledge — PKB 写入', () => {
  it('成功写入返回 ID', async () => {
    const { writeGoalKnowledge, extractGoalKnowledge } = await import('../../src/growth/knowledge-feedback');
    const mockStore = { insert: vi.fn().mockReturnValue('kc_test_123') };
    const knowledge = extractGoalKnowledge(makeGoal(), 'achieved', [
      { metricName: '净利润率', target: 8, actual: 9, met: true },
    ]);
    const id = writeGoalKnowledge(knowledge, mockStore);
    expect(id).toBe('kc_test_123');
    expect(mockStore.insert).toHaveBeenCalledOnce();
    expect(mockStore.insert.mock.calls[0][0].sourceType).toBe('goal_execution');
  });

  it('插入失败返回 null 不抛出', async () => {
    const { writeGoalKnowledge, extractGoalKnowledge } = await import('../../src/growth/knowledge-feedback');
    const mockStore = { insert: vi.fn().mockImplementation(() => { throw new Error('DB down'); }) };
    const knowledge = extractGoalKnowledge(makeGoal(), 'achieved', [
      { metricName: '净利润率', target: 8, actual: 9, met: true },
    ]);
    expect(() => writeGoalKnowledge(knowledge, mockStore)).not.toThrow();
    const id = writeGoalKnowledge(knowledge, mockStore);
    expect(id).toBeNull();
  });
});

describe('writeGoalKnowledge — PKB 写入验证', () => {
  it('成功写入返回 ID', async () => {
    const { writeGoalKnowledge, extractGoalKnowledge } = await import('../../src/growth/knowledge-feedback');
    const mockStore = { insert: vi.fn().mockReturnValue('kc_1') };
    const knowledge = extractGoalKnowledge(makeGoal(), 'not_achieved', [
      { metricName: '净利润率', target: 8, actual: 6, met: false },
    ]);
    const id = writeGoalKnowledge(knowledge, mockStore);
    expect(id).toBe('kc_1');
    expect(mockStore.insert).toHaveBeenCalledOnce();
    expect(mockStore.insert.mock.calls[0][0].sourceType).toBe('goal_execution');
  });

  it('写入失败返回 null', async () => {
    const { writeGoalKnowledge, extractGoalKnowledge } = await import('../../src/growth/knowledge-feedback');
    const mockStore = { insert: vi.fn().mockImplementation(() => { throw new Error('fail'); }) };
    const knowledge = extractGoalKnowledge(makeGoal(), 'not_achieved', [
      { metricName: '净利润率', target: 8, actual: 6, met: false },
    ]);
    const id = writeGoalKnowledge(knowledge, mockStore);
    expect(id).toBeNull();
  });
});
