/**
 * tests/growth/goal-conflict-detector.test.ts — D71 Goal 冲突检测器测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Goal, GraphBridgeLike } from '../../src/growth/goal-types';
import { detectConflicts, detectCascadeImpact, resolveConflict } from '../../src/growth/goal-conflict-detector';

const BASE: Goal = {
  goalId: 'g-base',
  orgId: 'org-1', proposalId: '', diagnosisId: '',
  title: '基础Goal', description: '',
  priority: 'P1', status: 'active',
  ownerDeptId: 'dept-a',
  createdAt: new Date().toISOString(), deadline: '2026-12-31',
  metrics: [], successCriteria: [],
  dependsOn: [], conflictsWith: [], reDiagnosisCount: 0,
  createdBy: { role: 'manager' },
  lastModifiedAt: new Date().toISOString(),
  plannedDurationDays: 90,
};

describe('GoalConflictDetector', () => {
  describe('detectConflicts', () => {
    it('检测 metric 方向冲突', () => {
      const existing: Goal = { ...BASE, goalId: 'g-1', title: '提升营收A', metrics: [{ metricName: '营收', currentValue: 100, targetValue: 200, unit: '万', computeContractId: 'C1' }] };
      const goal: Goal = { ...BASE, goalId: 'g-2', title: '缩减营收B', ownerDeptId: 'dept-a', metrics: [{ metricName: '营收', currentValue: 200, targetValue: 100, unit: '万', computeContractId: 'C1' }] };

      const conflicts = detectConflicts(goal, [existing]);
      expect(conflicts.length).toBe(1);
      expect(conflicts[0].conflictType).toBe('direction');
      expect(conflicts[0].metricName).toBe('营收');
    });

    it('同方向 metric → 无冲突', () => {
      const existing: Goal = { ...BASE, goalId: 'g-1', title: '提升营收A', metrics: [{ metricName: '营收', currentValue: 100, targetValue: 200, unit: '万', computeContractId: 'C1' }] };
      const goal: Goal = { ...BASE, goalId: 'g-2', title: '提升营收B', ownerDeptId: 'dept-a', metrics: [{ metricName: '营收', currentValue: 50, targetValue: 150, unit: '万', computeContractId: 'C1' }] };

      const conflicts = detectConflicts(goal, [existing]);
      expect(conflicts.length).toBe(0);
    });

    it('检测重复 Goal', () => {
      const existing: Goal = { ...BASE, goalId: 'g-1', title: '提升营收', description: '优化定价' };
      const goal: Goal = { ...BASE, goalId: 'g-2', ownerDeptId: 'dept-a', title: '提升营收', description: '优化定价' };

      const conflicts = detectConflicts(goal, [existing]);
      const dupes = conflicts.filter(c => c.conflictType === 'duplicate');
      expect(dupes.length).toBe(1);
    });

    it('不同部门 → 不检测冲突', () => {
      const existing: Goal = { ...BASE, goalId: 'g-1', ownerDeptId: 'dept-a' };
      const goal: Goal = { ...BASE, goalId: 'g-2', ownerDeptId: 'dept-b' };

      const conflicts = detectConflicts(goal, [existing]);
      expect(conflicts.length).toBe(0);
    });
  });

  describe('detectCascadeImpact', () => {
    it('检测依赖废弃后的级联影响', () => {
      const nodes = new Map<string, unknown>();
      const store: GraphBridgeLike = {
        createNode: () => '',
        getNode: () => null,
        updateNode: () => {},
        queryNodes(type) {
          if (type === 'GOAL') {
            return [
              { id: 'g-1', type: 'GOAL', props: { goalId: 'g-1', dependsOn: ['g-deprecated'], ownerDeptId: 'dept-a', title: '受影响Goal' } as unknown as Record<string, unknown> },
              { id: 'g-2', type: 'GOAL', props: { goalId: 'g-2', dependsOn: [], ownerDeptId: 'dept-a', title: '不受影响Goal' } as unknown as Record<string, unknown> },
            ];
          }
          return [];
        },
      };

      const impacts = detectCascadeImpact('g-deprecated', store);
      expect(impacts.length).toBe(1);
      expect(impacts[0].impactedGoalId).toBe('g-1');
    });
  });

  describe('resolveConflict', () => {
    it('记录冲突解决', () => {
      const record = resolveConflict('g-a', 'g-b', 'prioritize_a', 'user-admin');
      expect(record.goalA).toBe('g-a');
      expect(record.goalB).toBe('g-b');
      expect(record.resolution).toBe('prioritize_a');
      expect(record.resolvedBy).toBe('user-admin');
      expect(record.resolvedAt).toBeTruthy();
    });
  });
});
