/**
 * tests/growth/action-store.test.ts — D21 ActionStore 测试
 *
 * 覆盖 ≥10: create(2) + lifecycle(4) + query(3) + integrate(1)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ActionStore, isValidTransition } from '../../src/growth/action-store';
import type { SentinelFinding } from '../../src/agent/proactive-push';

const BASE_FINDING: SentinelFinding = {
  id: 'finding-1', sentinelId: 'cash-runway', sentinelName: '现金流哨兵',
  severity: 'critical', title: '现金流不足', detectedAt: new Date().toISOString(),
};

function createMockStore() {
  const nodes = new Map<string, unknown>();
  return {
    createNode(type: string, props: Record<string, unknown>) {
      const id = (props.id as string) || `mock-${nodes.size}`;
      nodes.set(id, { id, type, props });
      return id;
    },
    getNode(id: string) {
      return (nodes.get(id) as { id: string; type: string; props: Record<string, unknown> }) || null;
    },
    updateNode(id: string, props: Record<string, unknown>) {
      const existing = nodes.get(id) as { id: string; type: string; props: Record<string, unknown> } | undefined;
      if (existing) nodes.set(id, { ...existing, props: { ...existing.props, ...props } });
    },
    queryNodes(type: string, filters?: Record<string, unknown>) {
      return [...nodes.values()].filter(n => {
        const node = n as { id: string; type: string; props: Record<string, unknown> };
        if (node.type !== type) return false;
        if (filters) {
          return Object.entries(filters).every(([k, v]) => node.props[k] === v);
        }
        return true;
      }) as Array<{ id: string; type: string; props: Record<string, unknown> }>;
    },
  };
}

describe('ActionStore', () => {
  describe('createAction', () => {
    it('从哨兵信号创建 → 返回 Action 含完整字段', () => {
      const store = new ActionStore(createMockStore(), 'test-org');
      const action = store.createAction(BASE_FINDING, 'user-1', 'dept-sales');
      expect(action.id).toBeTruthy();
      expect(action.signalId).toBe('finding-1');
      expect(action.lifecycle).toBe('created');
      expect(action.assignee).toBe('user-1');
      expect(action.department).toBe('dept-sales');
    });

    it('GraphStore 未配置 → 降级返回（无 id 持久化）', () => {
      const store = new ActionStore();
      const action = store.createAction(BASE_FINDING);
      expect(action.id).toBeTruthy();
      expect(action.lifecycle).toBe('created');
    });
  });

  describe('updateLifecycle — 状态转换', () => {
    it('created → assigned → in_progress → completed → verified → closed 完整链', () => {
      const store = new ActionStore(createMockStore(), 'test-org');
      const action = store.createAction(BASE_FINDING);
      expect(action.lifecycle).toBe('created');

      const a1 = store.updateLifecycle(action.id, 'assigned');
      expect(a1.lifecycle).toBe('assigned');

      const a2 = store.updateLifecycle(action.id, 'in_progress');
      expect(a2.lifecycle).toBe('in_progress');

      const a3 = store.updateLifecycle(action.id, 'completed');
      expect(a3.lifecycle).toBe('completed');

      const a4 = store.updateLifecycle(action.id, 'verified');
      expect(a4.lifecycle).toBe('verified');

      const a5 = store.updateLifecycle(action.id, 'closed');
      expect(a5.lifecycle).toBe('closed');
      expect(a5.closedAt).toBeTruthy();
    });

    it('created → verified（跳转）→ 拒绝', () => {
      const store = new ActionStore(createMockStore(), 'test-org');
      const action = store.createAction(BASE_FINDING);
      expect(() => store.updateLifecycle(action.id, 'verified')).toThrow('非法');
    });

    it('closed → 任何状态 → 拒绝', () => {
      const store = new ActionStore(createMockStore(), 'test-org');
      const action = store.createAction(BASE_FINDING);
      store.updateLifecycle(action.id, 'assigned');
      store.updateLifecycle(action.id, 'in_progress');
      store.updateLifecycle(action.id, 'completed');
      store.updateLifecycle(action.id, 'verified');
      store.updateLifecycle(action.id, 'closed');
      expect(() => store.updateLifecycle(action.id, 'verified')).toThrow('非法');
    });

    it('不存在的 Action → 抛出 Error', () => {
      const store = new ActionStore(createMockStore(), 'test-org');
      expect(() => store.updateLifecycle('nonexistent', 'assigned')).toThrow('不存在');
    });
  });

  describe('query 方法', () => {
    it('getActionsBySignal → 返回匹配的 Action', () => {
      const mock = createMockStore();
      const store = new ActionStore(mock, 'test-org');
      store.createAction(BASE_FINDING);
      store.createAction({ ...BASE_FINDING, id: 'finding-2' });
      const actions = store.getActionsBySignal('finding-1');
      expect(actions.length).toBe(1);
    });

    it('getActionsByDepartment → 包含主部门和协作部门', () => {
      const mock = createMockStore();
      const store = new ActionStore(mock, 'test-org');
      store.createAction(BASE_FINDING, 'u1', 'dept-sales');
      const sales = store.getActionsByDepartment('dept-sales');
      expect(sales.length).toBe(1);
    });

    it('无 GraphStore → 空数组', () => {
      const store = new ActionStore();
      expect(store.getActionsBySignal('x')).toEqual([]);
      expect(store.getActionsByDepartment('x')).toEqual([]);
      expect(store.getActionsByLoop('x', 'x')).toEqual([]);
    });
  });
});

describe('isValidTransition', () => {
  it('合法转换', () => {
    expect(isValidTransition('created', 'assigned')).toBe(true);
    expect(isValidTransition('in_progress', 'completed')).toBe(true);
  });

  it('closed 不可逆', () => {
    expect(isValidTransition('closed', 'verified')).toBe(false);
  });

  it('跳转不可', () => {
    expect(isValidTransition('created', 'verified')).toBe(false);
  });
});
