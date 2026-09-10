/**
 * tests/growth/decision-record.test.ts — D701 决策驱动来源落地
 *
 * 覆盖：DecisionRecordStore create/get/list/updateRationale + 校验 fail-closed
 *       + store 降级不抛 + Goal.decisionRecordId 三来源透传（向后兼容）。
 */
import { describe, it, expect } from 'vitest';
import { DecisionRecordStore } from '../../src/growth/decision-record';
import type { DecisionRecordInput } from '../../src/growth/decision-record';
import { createGoal } from '../../src/growth/goal-store';
import type { Goal, GraphBridgeLike, AuditStoreLike } from '../../src/growth/goal-types';

interface FakeNode { id: string; type: string; props: Record<string, unknown>; }

function makeFakeStore(): { store: GraphBridgeLike; nodes: Map<string, FakeNode> } {
  const nodes = new Map<string, FakeNode>();
  const store: GraphBridgeLike = {
    createNode(type: string, props: Record<string, unknown>): string {
      const id = typeof props.goalId === 'string'
        ? props.goalId
        : typeof props.id === 'string' ? props.id : `node-${nodes.size}`;
      nodes.set(id, { id, type, props });
      return id;
    },
    getNode(id: string): unknown {
      return nodes.get(id) ?? null;
    },
    updateNode(id: string, props: Record<string, unknown>): void {
      const existing = nodes.get(id);
      if (existing) nodes.set(id, { id, type: existing.type, props });
    },
    queryNodes(type: string): Array<{ id: string; type: string; props: Record<string, unknown> }> {
      return [...nodes.values()].filter((n) => n.type === type);
    },
  };
  return { store, nodes };
}

const BASE_INPUT: DecisionRecordInput = {
  decidedBy: { role: 'founder', name: '张三' },
  direction: '明年进军东南亚市场',
  rationale: '看好多市场增长',
  relationToDiagnosis: 'overriding',
};

const fakeAudit: AuditStoreLike = { write: () => Promise.resolve('audit-1') };

describe('DecisionRecordStore', () => {
  it('create 返回 ok + id + decidedAt', () => {
    const { store } = makeFakeStore();
    const result = new DecisionRecordStore(store).create(BASE_INPUT);
    expect(result.ok).toBe(true);
    expect(result.record?.id).toBeTruthy();
    expect(result.record?.direction).toBe('明年进军东南亚市场');
    expect(result.record?.decidedAt).toBeTruthy();
    expect(result.record?.derivedGoals).toEqual([]);
  });

  it('relationToDiagnosis 三值均可创建并读回', () => {
    const { store } = makeFakeStore();
    const drs = new DecisionRecordStore(store);
    for (const relation of ['aligned', 'overriding', 'unrelated'] as const) {
      const created = drs.create({ ...BASE_INPUT, relationToDiagnosis: relation });
      expect(created.ok).toBe(true);
      const id = created.record?.id ?? '';
      expect(drs.get(id)?.relationToDiagnosis).toBe(relation);
    }
  });

  it('updateRationale 事后补充（§2.8 可修正）', () => {
    const { store } = makeFakeStore();
    const drs = new DecisionRecordStore(store);
    const created = drs.create(BASE_INPUT);
    const id = created.record?.id ?? '';
    const updated = drs.updateRationale(id, '补充：考虑汇率与合规风险');
    expect(updated.ok).toBe(true);
    expect(updated.record?.rationale).toBe('补充：考虑汇率与合规风险');
    expect(drs.get(id)?.rationale).toBe('补充：考虑汇率与合规风险');
  });

  it('constraints + derivedGoals 可选且保留', () => {
    const { store } = makeFakeStore();
    const drs = new DecisionRecordStore(store);
    const created = drs.create({
      ...BASE_INPUT,
      constraints: { budget: 2_000_000, resource: '海外 BD 团队' },
      derivedGoals: ['goal-jp-market', 'goal-budget-cap'],
    });
    const id = created.record?.id ?? '';
    const got = drs.get(id);
    expect(got?.constraints?.budget).toBe(2_000_000);
    expect(got?.constraints?.resource).toBe('海外 BD 团队');
    expect(got?.derivedGoals).toEqual(['goal-jp-market', 'goal-budget-cap']);
  });

  it('校验失败 fail-closed（空 direction/rationale/非法 relation）', () => {
    const { store } = makeFakeStore();
    const drs = new DecisionRecordStore(store);
    expect(drs.create({ ...BASE_INPUT, direction: '  ' }).ok).toBe(false);
    expect(drs.create({ ...BASE_INPUT, rationale: '' }).ok).toBe(false);
    const badRelation = drs.create({
      ...BASE_INPUT,
      relationToDiagnosis: 'nope' as DecisionRecordInput['relationToDiagnosis'],
    });
    expect(badRelation.ok).toBe(false);
    expect(drs.list().length).toBe(0);
  });

  it('store 抛错 → degraded 不抛', () => {
    const failing: GraphBridgeLike = {
      createNode: () => { throw new Error('db down'); },
      getNode: () => null,
      updateNode: () => undefined,
      queryNodes: () => [],
    };
    const result = new DecisionRecordStore(failing).create(BASE_INPUT);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('db down');
  });

  it('list 返回全部决策记录', () => {
    const { store } = makeFakeStore();
    const drs = new DecisionRecordStore(store);
    drs.create({ ...BASE_INPUT, direction: 'A' });
    drs.create({ ...BASE_INPUT, direction: 'B' });
    const list = drs.list();
    expect(list.length).toBe(2);
    expect(list.map((r) => r.direction).sort()).toEqual(['A', 'B']);
  });

  it('Goal.decisionRecordId 透传 + 决策→Goal 关联 + 向后兼容', () => {
    const { store } = makeFakeStore();
    const drs = new DecisionRecordStore(store);
    const dr = drs.create({ ...BASE_INPUT });
    const drId = dr.record?.id ?? '';
    const baseGoal = {
      orgId: 'org-1', proposalId: '', diagnosisId: 'diag-1',
      title: '进军东南亚', description: 'd', priority: 'P0' as const, status: 'draft' as const,
      ownerDeptId: 'dept-mkt', createdAt: '', deadline: '2026-12-31',
      metrics: [], successCriteria: [], dependsOn: [], conflictsWith: [],
      reDiagnosisCount: 0, createdBy: { role: 'founder' }, lastModifiedAt: '',
      plannedDurationDays: 90,
    };
    const withDecision = createGoal({ ...baseGoal, decisionRecordId: drId } as Goal, store, fakeAudit);
    const withoutDecision = createGoal({ ...baseGoal } as Goal, store, fakeAudit);
    const node1 = store.getNode(withDecision) as { props: Record<string, unknown> } | null;
    const node2 = store.getNode(withoutDecision) as { props: Record<string, unknown> } | null;
    expect(node1?.props.decisionRecordId).toBe(drId);
    expect(drs.get(drId)?.derivedGoals).toContain(withDecision);
    expect(node2?.props.decisionRecordId).toBeUndefined();
  });

  it('linkGoal 幂等 + 决策记录不存在 fail-closed', () => {
    const { store } = makeFakeStore();
    const drs = new DecisionRecordStore(store);
    const dr = drs.create(BASE_INPUT);
    const drId = dr.record?.id ?? '';
    expect(drs.linkGoal(drId, 'g-1').ok).toBe(true);
    expect(drs.linkGoal(drId, 'g-1').ok).toBe(true);
    expect(drs.get(drId)?.derivedGoals).toEqual(['g-1']);
    expect(drs.linkGoal('missing', 'g-2').ok).toBe(false);
  });
});
