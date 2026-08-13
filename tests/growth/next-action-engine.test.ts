/**
 * tests/growth/next-action-engine.test.ts — D74 NextAction 决策树测试
 */
import { describe, it, expect } from 'vitest';
import type { DepartmentWorkspace, ActiveGoal, WorkspaceAlert, PendingProposal } from '../../src/growth/workspace-types';

function makeWorkspace(overrides: Partial<DepartmentWorkspace> = {}): DepartmentWorkspace {
  return {
    departmentId: 'dept-1',
    name: 'Test Dept',
    activeGoals: [],
    recentAlerts: [],
    pendingProposals: [],
    diagnosticsReferenced: [],
    nextAction: null,
    degraded: false,
    degradedModules: [],
    ...overrides,
  };
}

function makeGoal(overrides: Partial<ActiveGoal> = {}): ActiveGoal {
  return {
    goalId: 'goal-1',
    title: 'Test Goal',
    deviationStatus: 'on_track',
    priority: 'P1',
    deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
    progressPercent: 50,
    ...overrides,
  };
}

describe('computeNextAction — 决策树', () => {
  it('有 critical Goal → review_critical_goal', async () => {
    const { computeNextAction } = await import('../../src/growth/next-action-engine');
    const ws = makeWorkspace({
      activeGoals: [makeGoal({ deviationStatus: 'critical' })],
    });
    const result = computeNextAction(ws);
    expect(result).not.toBeNull();
    expect(result!.actionType).toBe('review_critical_goal');
    expect(result!.priority).toBe('P0');
    expect(result!.targetGoalId).toBe('goal-1');
  });

  it('有即将过期 Proposal → confirm_proposal', async () => {
    const { computeNextAction } = await import('../../src/growth/next-action-engine');
    const future = new Date(Date.now() + 1 * 86400000); // 1天后
    const proposals: PendingProposal[] = [{
      proposalId: 'prop-1',
      title: 'Test Proposal',
      department: 'dept-1',
      expiresAt: future.toISOString(),
      status: 'pending_selection',
    }];
    const ws = makeWorkspace({ pendingProposals: proposals });
    const result = computeNextAction(ws);
    expect(result).not.toBeNull();
    expect(result!.actionType).toBe('confirm_proposal');
    expect(result!.priority).toBe('P1');
  });

  it('有未消除告警 → handle_alert', async () => {
    const { computeNextAction } = await import('../../src/growth/next-action-engine');
    const alerts: WorkspaceAlert[] = [{
      alertId: 'alert-1',
      severity: 'warning',
      timestamp: new Date().toISOString(),
      message: 'Test alert',
      dismissed: false,
      dndCategory: 'P1',
    }];
    const ws = makeWorkspace({ recentAlerts: alerts });
    const result = computeNextAction(ws);
    expect(result).not.toBeNull();
    expect(result!.actionType).toBe('handle_alert');
  });

  it('全部 on_track → review_dashboard', async () => {
    const { computeNextAction } = await import('../../src/growth/next-action-engine');
    const ws = makeWorkspace({
      activeGoals: [makeGoal({ deviationStatus: 'on_track' })],
    });
    const result = computeNextAction(ws);
    expect(result).not.toBeNull();
    expect(result!.actionType).toBe('review_dashboard');
    expect(result!.priority).toBe('P2');
  });

  it('无活跃数据 → null', async () => {
    const { computeNextAction } = await import('../../src/growth/next-action-engine');
    const ws = makeWorkspace({
      activeGoals: [],
      pendingProposals: [],
      recentAlerts: [],
    });
    const result = computeNextAction(ws);
    expect(result).toBeNull();
  });
});
