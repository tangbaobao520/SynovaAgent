/**
 * tests/growth/goal-lifecycle.test.ts — D71 Goal 生命周期管理测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Goal, GraphBridgeLike, AuditStoreLike, PolicyEngineLike } from '../../src/growth/goal-types';
import { createGoal, getGoal } from '../../src/growth/goal-store';

// ═══ 测试夹具 ═══

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    goalId: '',
    orgId: 'org-test', proposalId: '', diagnosisId: 'diag-1',
    title: '测试Goal', description: '',
    priority: 'P1', status: 'draft',
    ownerDeptId: 'dept-a',
    createdAt: new Date().toISOString(),
    deadline: '2026-12-31',
    metrics: [{ metricName: '营收', currentValue: 5, targetValue: 15, unit: '%', computeContractId: 'C1' }],
    successCriteria: [],
    dependsOn: [], conflictsWith: [],
    reDiagnosisCount: 0,
    createdBy: { role: 'manager' },
    lastModifiedAt: new Date().toISOString(),
    plannedDurationDays: 90,
    ...overrides,
  };
}

// ═══ Mock 存储 ═══

function createMocks(): { store: GraphBridgeLike; audit: AuditStoreLike; policy: PolicyEngineLike; auditEntries: unknown[] } {
  const nodes = new Map<string, unknown>();
  const auditEntries: unknown[] = [];

  const store: GraphBridgeLike = {
    createNode(type, props) {
      const id = (props.goalId as string) || `mock-${nodes.size + 1}`;
      nodes.set(id, { id, type, props });
      return id;
    },
    getNode(id) {
      return (nodes.get(id) as { id: string; type: string; props: Record<string, unknown> }) || null;
    },
    updateNode(id, props) {
      const existing = nodes.get(id) as { id: string; type: string; props: Record<string, unknown> } | undefined;
      if (existing) {
        nodes.set(id, { ...existing, props: { ...existing.props, ...props } });
      }
    },
    queryNodes() { return []; },
  };

  const audit: AuditStoreLike = {
    async write(entry) { auditEntries.push(entry); return 'audit-id'; },
  };

  const policy: PolicyEngineLike = {
    evaluate: () => ({ allow: true }),
  };

  return { store, audit, policy, auditEntries };
}

describe('GoalLifecycle', () => {
  describe('transitionGoal', () => {
    it('draft → pending_ga → active 完整流转', async () => {
      const { transitionGoal } = await import('../../src/growth/goal-lifecycle');
      const { store, audit, policy } = createMocks();
      const id = createGoal(makeGoal({ status: 'draft' }), store);

      expect(() => transitionGoal(id, 'pending_ga', { role: 'manager' }, store, audit, policy)).not.toThrow();
      expect(getGoal(id, store)?.status).toBe('pending_ga');

      expect(() => transitionGoal(id, 'active', { role: 'ga' }, store, audit, policy)).not.toThrow();
      expect(getGoal(id, store)?.status).toBe('active');
    });

    it('draft → abandoned（创建者废弃）', async () => {
      const { transitionGoal } = await import('../../src/growth/goal-lifecycle');
      const { store, audit, policy } = createMocks();
      const id = createGoal(makeGoal({ status: 'draft' }), store);

      expect(() => transitionGoal(id, 'abandoned', { role: 'manager' }, store, audit, policy)).not.toThrow();
      expect(getGoal(id, store)?.status).toBe('abandoned');
    });

    it('PolicyEngine 拒绝 → 抛出 Error', async () => {
      const { transitionGoal } = await import('../../src/growth/goal-lifecycle');
      const { store, audit } = createMocks();
      const policy: PolicyEngineLike = {
        evaluate: () => ({ allow: false, denyReason: 'deny_default: 无权限' }),
      };
      const id = createGoal(makeGoal({ status: 'active' }), store);

      expect(() => transitionGoal(id, 'abandoned', { role: 'staff' }, store, audit, policy))
        .toThrow('权限不足');
    });
  });

  describe('closeGoal', () => {
    it('闭环 Goal → 状态变为 completed', async () => {
      const { closeGoal } = await import('../../src/growth/goal-lifecycle');
      const { store, audit, policy } = createMocks();
      const id = createGoal(makeGoal({ status: 'active', successCriteria: [{ criterion: '营收达标', verificationMethod: 'metric_threshold', verified: true }] }), store);

      expect(() => closeGoal(id, 'achieved', [{ metricName: '营收', currentValue: 15, targetValue: 15, unit: '%', computeContractId: 'C1' }], store, audit)).not.toThrow();
      expect(getGoal(id, store)?.status).toBe('completed');
    });

    it('非 active 状态 → 抛出 Error', async () => {
      const { closeGoal } = await import('../../src/growth/goal-lifecycle');
      const { store, audit } = createMocks();
      const id = createGoal(makeGoal({ status: 'draft' }), store);

      expect(() => closeGoal(id, 'achieved', [], store, audit)).toThrow('只能闭环 active 状态的 Goal');
    });

    it('闭环后记录 actualDurationDays', async () => {
      const { closeGoal } = await import('../../src/growth/goal-lifecycle');
      const { store, audit } = createMocks();
      const id = createGoal(makeGoal({ status: 'active', successCriteria: [{ criterion: '营收达标', verificationMethod: 'metric_threshold', verified: true }] }), store);

      closeGoal(id, 'achieved', [{ metricName: '营收', currentValue: 15, targetValue: 15, unit: '%', computeContractId: 'C1' }], store, audit);
      const updated = getGoal(id, store);
      expect(updated?.actualDurationDays).toBeGreaterThan(0);
    });
  });

  describe('archiveGoal', () => {
    it('completed → archived', async () => {
      const { archiveGoal } = await import('../../src/growth/goal-lifecycle');
      const { store, audit, policy } = createMocks();
      const id = createGoal(makeGoal({ status: 'completed', lastModifiedAt: '2025-01-01T00:00:00.000Z' }), store);

      expect(() => archiveGoal(id, store, audit)).not.toThrow();
      expect(getGoal(id, store)?.status).toBe('archived');
    });

    it('active 状态 → 抛出 Error（不可归档）', async () => {
      const { archiveGoal } = await import('../../src/growth/goal-lifecycle');
      const { store, audit } = createMocks();
      const id = createGoal(makeGoal({ status: 'active' }), store);

      expect(() => archiveGoal(id, store, audit)).toThrow('只有 completed 或 abandoned');
    });
  });
});
