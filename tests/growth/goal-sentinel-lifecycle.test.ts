/**
 * tests/growth/goal-sentinel-lifecycle.test.ts — D73-FIX lifecycle 测试补全
 *
 * 覆盖: registerOnGoalActive / unregisterOnGoalClosed / pauseOnGoalPaused / resumeOnGoalResumed
 * 约束: 4个it()含expect()断言 / 零as any
 */
import { describe, it, expect, vi } from 'vitest';
import { registerOnGoalActive, unregisterOnGoalClosed, pauseOnGoalPaused, resumeOnGoalResumed } from '../../src/growth/goal-sentinel-lifecycle';
import type { Goal, GraphBridgeLike } from '../../src/growth/goal-types';
import type { SentinelRegistry, Sentinel } from '../../src/sentinel/types';

// ═══ Mocks ═══

/** Mock SentinelRegistry — 跟踪 register/unregister 调用 */
class MockRegistry implements SentinelRegistry {
  public registered: string[] = [];
  public unregistered: string[] = [];
  private map = new Map<string, Sentinel>();

  register(s: Sentinel): void { this.registered.push(s.config.id); this.map.set(s.config.id, s); }
  unregister(id: string): void { this.unregistered.push(id); this.map.delete(id); }
  get(id: string): Sentinel | undefined { return this.map.get(id); }
  list(): Sentinel[] { return Array.from(this.map.values()); }
  listByCategory(): Sentinel[] { return this.list(); }
  listByPriority(): Sentinel[] { return this.list(); }
  count(): number { return this.map.size; }
}

/** Mock store — getNode 返回 Goal props */
function createMockStore(goal: Goal | null): GraphBridgeLike {
  const node = goal ? { id: goal.goalId, type: 'GOAL', props: goal as unknown as Record<string, unknown> } : null;
  return {
    createNode: vi.fn(),
    getNode: vi.fn(() => node),
    updateNode: vi.fn(),
    queryNodes: vi.fn(() => []),
  } as unknown as GraphBridgeLike;
}

/** 测试用 Goal fixture */
function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    goalId: 'goal-001',
    orgId: 'org-1',
    proposalId: 'prop-1',
    diagnosisId: 'diag-1',
    title: '测试Goal',
    description: '用于lifecycle测试',
    priority: 'P1',
    status: 'active',
    ownerDeptId: 'dept-1',
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    deadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    metrics: [{ metricName: 'test_metric', currentValue: 50, targetValue: 100, unit: '%', computeContractId: 'COMPUTE-TEST-v1' }],
    successCriteria: [{ criterion: '完成', verificationMethod: 'metric_threshold', verified: false }],
    dependsOn: [],
    conflictsWith: [],
    reDiagnosisCount: 0,
    createdBy: { role: 'ga' },
    lastModifiedAt: new Date().toISOString(),
    plannedDurationDays: 30,
    tags: [],
    ...overrides,
  };
}

// ═══ Tests ═══

describe('D73-FIX — goal-sentinel-lifecycle', () => {
  it('registerOnGoalActive: Goal active → 哨兵注册到registry', () => {
    const goal = makeGoal();
    // 模拟 goal-store.getGoal 返回 goal
    // 使用 queryNodes 传递 goal
    const store = createMockStore(goal);
    const registry = new MockRegistry();

    registerOnGoalActive('goal-001', store, registry);

    expect(registry.registered).toContain('goal-goal-001');
  });

  it('unregisterOnGoalClosed: Goal completed → 哨兵已注销', () => {
    const registry = new MockRegistry();
    // 先注册
    const goal = makeGoal();
    const store = createMockStore(goal);
    registerOnGoalActive('goal-001', store, registry);
    expect(registry.registered).toHaveLength(1);

    // 注销
    unregisterOnGoalClosed('goal-001', registry);
    expect(registry.unregistered).toContain('goal-goal-001');
  });

  it('pauseOnGoalPaused: Goal paused → 哨兵已注销', () => {
    const registry = new MockRegistry();
    const goal = makeGoal();
    const store = createMockStore(goal);
    registerOnGoalActive('goal-001', store, registry);
    expect(registry.registered).toHaveLength(1);

    pauseOnGoalPaused('goal-001', registry);
    expect(registry.unregistered).toContain('goal-goal-001');
  });

  it('resumeOnGoalResumed: paused→active → 哨兵重新注册', () => {
    const goal = makeGoal();
    const store = createMockStore(goal);
    const registry = new MockRegistry();

    resumeOnGoalResumed('goal-001', store, registry);

    expect(registry.registered).toContain('goal-goal-001');
  });
});
