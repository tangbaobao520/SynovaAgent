/**
 * tests/growth/goal-store.test.ts — D71 GoalStore 单元测试
 *
 * 覆盖: 创建/查询/列/更新/状态转换(5条核心)/非法/前置条件/审计写入
 */
import { describe, it, expect } from 'vitest';
import type { Goal, GraphBridgeLike, AuditStoreLike } from '../../src/growth/goal-types';
import {
  createGoal, getGoal, listGoalsByDept, listGoalsByOrg,
  updateGoalStatus, isValidTransition, checkDraftPreconditions, checkCompletionPreconditions,
} from '../../src/growth/goal-store';

// ═══ 测试夹具 ═══

const BASE_GOAL: Goal = {
  goalId: '',
  orgId: 'org-test',
  proposalId: 'prop-1',
  diagnosisId: 'diag-1',
  title: '提升营收增长率',
  description: '通过优化定价策略提升营收',
  priority: 'P1',
  status: 'draft',
  ownerDeptId: 'dept-sales',
  assignedTo: 'user-1',
  createdAt: new Date().toISOString(),
  deadline: '2026-12-31T00:00:00.000Z',
  metrics: [
    { metricName: '营收增长率', currentValue: 5, targetValue: 15, unit: '%', computeContractId: 'COMPUTE-REVENUE-v1', baselinePeriod: { start: '2026-01-01', end: '2026-06-30' } },
  ],
  successCriteria: [
    { criterion: '月营收≥500万', verificationMethod: 'metric_threshold', verified: false },
  ],
  dependsOn: [],
  conflictsWith: [],
  reDiagnosisCount: 0,
  createdBy: { role: 'manager', departmentId: 'dept-sales' },
  lastModifiedAt: new Date().toISOString(),
  plannedDurationDays: 180,
};

// ═══ Mock GraphStore ═══

function createMockStore(): { store: GraphBridgeLike; nodes: Map<string, unknown> } {
  const nodes = new Map<string, unknown>();
  const store: GraphBridgeLike = {
    createNode(type, props) {
      const id = props.goalId as string || `mock-${nodes.size + 1}`;
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
    queryNodes(type, filters) {
      const results: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
      for (const [, value] of nodes) {
        const n = value as { id: string; type: string; props: Record<string, unknown> };
        if (n.type !== type) continue;
        if (filters) {
          let matches = true;
          for (const [k, v] of Object.entries(filters)) {
            if (n.props[k] !== v) { matches = false; break; }
          }
          if (!matches) continue;
        }
        results.push(n);
      }
      return results;
    },
  };
  return { store, nodes };
}

function createMockAudit(): { audit: AuditStoreLike; entries: unknown[] } {
  const entries: unknown[] = [];
  const audit: AuditStoreLike = {
    async write(entry) { entries.push(entry); return 'audit-id'; },
  };
  return { audit, entries };
}

// ═══ Tests ═══

describe('GoalStore', () => {
  describe('createGoal / getGoal', () => {
    it('创建 Goal → 返回 goalId', () => {
      const { store } = createMockStore();
      const { audit } = createMockAudit();
      const goal: Goal = { ...BASE_GOAL, status: 'draft' };
      const id = createGoal(goal, store);
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });

    it('按 ID 获取 Goal → 返回完整对象', () => {
      const { store } = createMockStore();
      const { audit } = createMockAudit();
      const goal: Goal = { ...BASE_GOAL, status: 'draft' };
      const id = createGoal(goal, store);

      const result = getGoal(id, store);
      expect(result).not.toBeNull();
      expect(result?.goalId).toBe(id);
      expect(result?.title).toBe('提升营收增长率');
    });

    it('不存在的 ID → 返回 null', () => {
      const { store } = createMockStore();
      const result = getGoal('nonexistent-id', store);
      expect(result).toBeNull();
    });
  });

  describe('listByDept / listByOrg', () => {
    it('按部门列出 Goal', () => {
      const { store } = createMockStore();
      const { audit } = createMockAudit();
      createGoal({ ...BASE_GOAL, orgId: 'org-1', ownerDeptId: 'dept-a' }, store);
      createGoal({ ...BASE_GOAL, orgId: 'org-1', ownerDeptId: 'dept-b' }, store);
      createGoal({ ...BASE_GOAL, orgId: 'org-1', ownerDeptId: 'dept-a' }, store);

      const deptA = listGoalsByDept('dept-a', store);
      expect(deptA.length).toBe(2);
    });

    it('按组织列出 Goal', () => {
      const { store } = createMockStore();
      const { audit } = createMockAudit();
      createGoal({ ...BASE_GOAL, orgId: 'org-1' }, store);
      createGoal({ ...BASE_GOAL, orgId: 'org-2' }, store);

      const org1 = listGoalsByOrg('org-1', store);
      expect(org1.length).toBe(1);
    });
  });

  describe('状态转换', () => {
    it('draft → pending_ga (合法转换)', () => {
      const { store } = createMockStore();
      const { audit } = createMockAudit();
      const goal: Goal = { ...BASE_GOAL, status: 'draft' };
      const id = createGoal(goal, store);

      expect(() => updateGoalStatus(id, 'pending_ga', store, audit)).not.toThrow();
      const updated = getGoal(id, store);
      expect(updated?.status).toBe('pending_ga');
    });

    it('pending_ga → active (合法转换)', () => {
      const { store } = createMockStore();
      const { audit } = createMockAudit();
      const goal: Goal = { ...BASE_GOAL, status: 'pending_ga' };
      const id = createGoal(goal, store);

      expect(() => updateGoalStatus(id, 'active', store, audit)).not.toThrow();
    });

    it('active → completed — 前置条件不满足则拒绝', () => {
      const { store } = createMockStore();
      const { audit } = createMockAudit();
      const goal: Goal = { ...BASE_GOAL, status: 'active', successCriteria: [] };
      const id = createGoal(goal, store);

      expect(() => updateGoalStatus(id, 'completed', store, audit)).toThrow('前置条件不满足');
    });

    it('active → abandoned (合法转换)', () => {
      const { store } = createMockStore();
      const { audit } = createMockAudit();
      const goal: Goal = { ...BASE_GOAL, status: 'active' };
      const id = createGoal(goal, store);

      expect(() => updateGoalStatus(id, 'abandoned', store, audit)).not.toThrow();
    });

    it('非法状态转换 → 抛出 Error', () => {
      const { store } = createMockStore();
      const { audit } = createMockAudit();
      const goal: Goal = { ...BASE_GOAL, status: 'draft' };
      const id = createGoal(goal, store);

      // draft → completed 是非法转换（不在17条规则中）
      expect(() => updateGoalStatus(id, 'completed', store, audit)).toThrow('非法状态转换');
    });

    it('completed → archived (合法)', () => {
      const { store } = createMockStore();
      const { audit } = createMockAudit();
      const goal: Goal = { ...BASE_GOAL, status: 'completed' };
      const id = createGoal(goal, store);

      expect(() => updateGoalStatus(id, 'archived', store, audit)).not.toThrow();
    });
  });

  describe('审计日志', () => {
    it('状态变更写入审计日志', () => {
      const { store } = createMockStore();
      const { audit, entries } = createMockAudit();
      const goal: Goal = { ...BASE_GOAL, status: 'draft' };
      const id = createGoal(goal, store);

      updateGoalStatus(id, 'pending_ga', store, audit);
      expect(entries.length).toBeGreaterThanOrEqual(1);
      const logEntry = entries[0] as Record<string, unknown>;
      expect(logEntry.action).toContain('goal.status');
      expect(logEntry.targetId).toBe(id);
    });
  });

  describe('前置条件检查', () => {
    it('checkDraftPreconditions — title 为空时拒绝', () => {
      const goal = { ...BASE_GOAL, title: '' };
      const result = checkDraftPreconditions(goal);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('title');
    });

    it('checkCompletionPreconditions — 全部条件已验证时通过', () => {
      const goal = { ...BASE_GOAL, successCriteria: [
        { criterion: '条件1', verificationMethod: 'metric_threshold' as const, verified: true },
      ]};
      const result = checkCompletionPreconditions(goal);
      expect(result.valid).toBe(true);
    });
  });

  describe('isValidTransition', () => {
    it('17条规则中的转换 — 合法', () => {
      expect(isValidTransition('draft', 'pending_ga')).toBe(true);
      expect(isValidTransition('active', 'completed')).toBe(true);
    });

    it('不在17条规则中的转换 — 非法', () => {
      expect(isValidTransition('draft', 'completed')).toBe(false);
      expect(isValidTransition('abandoned', 'active')).toBe(false);
      expect(isValidTransition('archived', 'draft')).toBe(false);
    });
  });

  describe('getActiveGoalCount', () => {
    it('返回活跃 Goal 数量', async () => {
      const { getActiveGoalCount } = await import('../../src/growth/goal-store');
      const { store } = createMockStore();
      const { audit } = createMockAudit();

      const g1: Goal = { ...BASE_GOAL, status: 'active' };
      const g2: Goal = { ...BASE_GOAL, status: 'draft' };
      const g3: Goal = { ...BASE_GOAL, status: 'active' };
      createGoal(g1, store);
      createGoal(g2, store);
      createGoal(g3, store);

      const count = getActiveGoalCount('org-test', store);
      expect(count).toBe(2);
    });
  });
});
