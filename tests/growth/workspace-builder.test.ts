/**
 * tests/growth/workspace-builder.test.ts — D74 工作台数据聚合器测试
 */
import { describe, it, expect } from 'vitest';
import type { WorkspaceBuilderDeps } from '../../src/growth/workspace-builder';
import type { ActiveGoal, WorkspaceAlert, PendingProposal, DiagnosticReference } from '../../src/growth/workspace-types';

function makeDeps(overrides: Partial<WorkspaceBuilderDeps> = {}): WorkspaceBuilderDeps {
  return {
    graphStore: {
      queryNodes: () => [],
    },
    ...overrides,
  };
}

describe('buildDepartmentWorkspace — 数据聚合', () => {
  it('全量数据聚合正常', async () => {
    const { buildDepartmentWorkspace } = await import('../../src/growth/workspace-builder');
    const deps = makeDeps({
      graphStore: {
        queryNodes: (_type, filters) => {
          if (filters?.name === 'dept-1') {
            return [{ id: 'team-1', type: 'resource/team', props: { name: '研发部', headcount: 50 } }];
          }
          return [];
        },
      },
      getGoalsByDept: () => [{
        goalId: 'goal-1',
        title: '提高营收',
        deviationStatus: 'on_track' as const,
        priority: 'P1' as const,
        deadline: new Date(Date.now() + 30 * 86400000).toISOString(),
        progressPercent: 60,
        owner: '张三',
      }],
      getProposalsByDept: () => [{
        proposalId: 'prop-1',
        title: '市场扩展方案',
        department: 'dept-1',
        expiresAt: new Date(Date.now() + 10 * 86400000).toISOString(),
        status: 'pending_selection',
      }],
      getAlertsByDept: () => [],
      getDiagnosticsByDept: () => [{
        reportId: 'report-1',
        summary: '诊断摘要',
        generatedAt: new Date().toISOString(),
        relevantFindings: ['发现1', '发现2'],
      }],
    });

    const ws = buildDepartmentWorkspace('dept-1', deps);
    expect(ws.departmentId).toBe('dept-1');
    expect(ws.name).toBe('研发部');
    expect(ws.activeGoals).toHaveLength(1);
    expect(ws.pendingProposals).toHaveLength(1);
    expect(ws.diagnosticsReferenced).toHaveLength(1);
    expect(ws.degraded).toBe(false);
    expect(ws.degradedModules).toHaveLength(0);
  });

  it('单模块失败标记 degraded 不阻断其他', async () => {
    const { buildDepartmentWorkspace } = await import('../../src/growth/workspace-builder');
    const deps = makeDeps({
      graphStore: {
        queryNodes: () => {
          throw new Error('GraphStore 不可用');
        },
      },
      getGoalsByDept: () => [{
        goalId: 'goal-2',
        title: '降低成本',
        deviationStatus: 'at_risk' as const,
        priority: 'P1' as const,
        deadline: new Date().toISOString(),
        progressPercent: 30,
      }],
    });

    const ws = buildDepartmentWorkspace('dept-2', deps);
    expect(ws.departmentId).toBe('dept-2');
    expect(ws.name).toBe('dept-2'); // fallback: deptId as name
    expect(ws.activeGoals).toHaveLength(1);
    expect(ws.degraded).toBe(true);
    expect(ws.degradedModules.length).toBeGreaterThanOrEqual(1);
    expect(ws.degradedModules[0].step).toBe('department_info');
  });

  it('无数据时返回空数组 + null nextAction', async () => {
    const { buildDepartmentWorkspace } = await import('../../src/growth/workspace-builder');
    const ws = buildDepartmentWorkspace('empty-dept', makeDeps());
    expect(ws.activeGoals).toHaveLength(0);
    expect(ws.pendingProposals).toHaveLength(0);
    expect(ws.recentAlerts).toHaveLength(0);
    expect(ws.diagnosticsReferenced).toHaveLength(0);
    expect(ws.nextAction).toBeNull();
    expect(ws.degraded).toBe(false);
  });

  it('所有模块都失败时仍能返回基础结构', async () => {
    const { buildDepartmentWorkspace } = await import('../../src/growth/workspace-builder');
    const deps = makeDeps({
      graphStore: {
        queryNodes: () => { throw new Error('GraphStore down'); },
      },
      getGoalsByDept: () => { throw new Error('Goal store down'); },
      getProposalsByDept: () => { throw new Error('Proposal store down'); },
      getAlertsByDept: () => { throw new Error('Alert store down'); },
      getDiagnosticsByDept: () => { throw new Error('Diagnostic store down'); },
    });

    const ws = buildDepartmentWorkspace('failing-dept', deps);
    expect(ws.departmentId).toBe('failing-dept');
    expect(ws.activeGoals).toHaveLength(0);
    expect(ws.pendingProposals).toHaveLength(0);
    expect(ws.recentAlerts).toHaveLength(0);
    expect(ws.diagnosticsReferenced).toHaveLength(0);
    expect(ws.degraded).toBe(true);
    expect(ws.degradedModules.length).toBeGreaterThanOrEqual(4);
  });

  it('告警受免打扰过滤', async () => {
    const { buildDepartmentWorkspace } = await import('../../src/growth/workspace-builder');
    const p2Alert: WorkspaceAlert = {
      alertId: 'alert-p2',
      severity: 'info',
      timestamp: new Date().toISOString(),
      message: 'P2 info alert',
      dismissed: false,
      dndCategory: 'P2',
    };
    const deps = makeDeps({
      getAlertsByDept: () => [p2Alert],
    });

    const ws = buildDepartmentWorkspace('filter-dept', deps);
    // P2 告警被 DND 过滤
    expect(ws.recentAlerts).toHaveLength(0);
    expect(ws.degraded).toBe(false);
  });
});
