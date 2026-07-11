/**
 * tests/l4/data-purger.test.ts — DataPurger 单元测试 (D40)
 *
 * 铁律 48: 测试必须有 expect() 断言
 * 覆盖: SafetyLock / 取消清除 / 四阶段顺序 / 立即模式 / 降级
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { DataPurger, type PurgeJob, type PurgeStage } from '../../src/l4/data-purger';
import type { GraphStore } from '../../src/l4/graph-bridge';
import type { SessionStore, SessionRow } from '../../src/store/session-store';
import type { AgentMemoryStore, MemoryEntry } from '../../src/l4/agent-memory-store';

// ═══ Mock 存储 ═══

interface MockNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

/** 内存化 MockGraphStore，track 删除操作 */
function createMockStore() {
  const nodes: MockNode[] = [];
  let deletedNodeIds: string[] = [];
  let deletedEdgeIds: string[] = [];
  let updatedNodes: string[] = [];

  const graphStore: GraphStore = {
    createNode: (type: string, props: Record<string, unknown>) => {
      const id = `n_${nodes.length + 1}`;
      nodes.push({ id, type, props });
      return id;
    },
    createNodes: () => [],
    queryNodes: (type: string) => nodes.filter((n) => n.type === type).map((n) => ({
      id: n.id, type: n.type, props: { ...n.props },
    })),
    getNode: (id: string) => nodes.find((n) => n.id === id) || null,
    updateNode: (id: string, props: Record<string, unknown>) => {
      const node = nodes.find((n) => n.id === id);
      if (node) { node.props = { ...node.props, ...props }; updatedNodes.push(id); }
    },
    deleteNode: (id: string) => {
      const idx = nodes.findIndex((n) => n.id === id);
      if (idx >= 0) { nodes.splice(idx, 1); deletedNodeIds.push(id); }
    },
    deleteEdge: (id: string) => { deletedEdgeIds.push(id); },
    queryEdges: () => [],
    createEdge: () => '',
    createEdges: () => [],
    traverse: () => null,
    findPaths: () => [],
    queryTriples: () => [],
    getNodeAtTime: () => null,
  };

  function reset() { nodes.length = 0; deletedNodeIds = []; deletedEdgeIds = []; updatedNodes = []; }
  function getDeletedNodeIds() { return [...deletedNodeIds]; }
  function getUpdatedNodes() { return [...updatedNodes]; }
  function getNodes() { return [...nodes]; }

  return { graphStore, reset, getDeletedNodeIds, getUpdatedNodes, getNodes };
}

function createMockSessionStore(sessions: Array<Partial<SessionRow>>) {
  let sessionRows: SessionRow[] = sessions.map((s) => ({
    id: s.id || '',
    orgId: s.orgId || '',
    phase: s.phase ?? 0,
    stateJson: s.stateJson ?? null,
    createdAt: s.createdAt || new Date().toISOString(),
    updatedAt: s.updatedAt || new Date().toISOString(),
  }));

  return {
    listSessions: () => sessionRows,
    getMessages: () => [],
    deleteSession: (id: string) => { sessionRows = sessionRows.filter((s) => s.id !== id); },
    getSession: () => null,
    listSessionsWithState: () => [],
    searchSessions: () => [],
  } as unknown as SessionStore;
}

function createMockMemoryStore(initial: MemoryEntry[]) {
  let entries = [...initial];

  return {
    list: (query: { orgId: string }) => entries.filter((e) => e.orgId === query.orgId),
    forget: (orgId: string, key: string) => {
      const before = entries.length;
      entries = entries.filter((e) => !(e.orgId === orgId && e.key === key));
      return entries.length < before;
    },
    recall: () => null,
    listByType: () => [],
    search: () => [],
    searchMemory: () => [],
    getStats: () => ({ totalEntries: 0, byType: {}, byOrg: {}, expiredCount: 0 }),
    purgeExpired: () => 0,
  } as unknown as AgentMemoryStore;
}

// ═══ Tests ═══

describe('DataPurger SafetyLock', () => {
  it('SafetyLock 阶段 → 标记完成 + 节点已锁定', async () => {
    const mock = createMockStore();
    // 添加节点并设置 orgId
    mock.graphStore.createNode('resource/person', { name: '张三', orgId: 'tenant-1' });
    mock.graphStore.createNode('outcome/financial', { revenue: 100, orgId: 'tenant-1' });

    const sessionStore = createMockSessionStore([]);
    const memoryStore = createMockMemoryStore([]);
    const purger = new DataPurger(mock.graphStore, sessionStore, memoryStore);

    const result = await purger.purge('tenant-1', true); // immediate=true 跳过冷静期

    expect(result.job.stages[0].name).toBe('safety_lock');
    expect(result.job.stages[0].status).toBe('completed');
    expect(result.job.stages[0].completedAt).toBeDefined();

    // 验证节点被标记了 _purgeLocked
    const updatedNodes = mock.getUpdatedNodes();
    expect(updatedNodes.length).toBeGreaterThanOrEqual(1);
  });
});

describe('DataPurger 取消清除', () => {
  it('WaitingPeriod 阶段可取消', async () => {
    const mock = createMockStore();
    mock.graphStore.createNode('resource/person', { name: '张三', orgId: 'tenant-1' });

    const sessionStore = createMockSessionStore([{ id: 's1', orgId: 'tenant-1' }]);
    const memoryStore = createMockMemoryStore([
      { id: 'm1', orgId: 'tenant-1', key: 'k1', value: 'v1', type: 'fact', confidence: 0.9, source: 'manual', tags: [], createdAt: '', updatedAt: '', expiresAt: null, accessCount: 0 },
    ]);
    const purger = new DataPurger(mock.graphStore, sessionStore, memoryStore);

    // 用 immediate=false 发起清除（正常冷静期模式）
    const result = await purger.purge('tenant-1', false);

    // SafetyLock 应该已完成
    expect(result.job.stages[0].status).toBe('completed');

    // 在 waiting 期间取消
    const cancelled = purger.cancelPurge(result.job.id);
    expect(cancelled).toBe(true);

    const status = purger.getStatus(result.job.id);
    expect(status?.status).toBe('cancelled');
  });

  it('级联删除开始后不可取消', async () => {
    const mock = createMockStore();
    mock.graphStore.createNode('resource/person', { name: '张三', orgId: 'tenant-1' });

    const sessionStore = createMockSessionStore([{ id: 's1', orgId: 'tenant-1' }]);
    const memoryStore = createMockMemoryStore([]);
    const purger = new DataPurger(mock.graphStore, sessionStore, memoryStore);

    // immediate=true → 跳过冷静期，直接进入级联删除
    const result = await purger.purge('tenant-1', true);

    // 任务已完成或进行中（级联删除已执行）
    const cancelled = purger.cancelPurge(result.job.id);
    expect(cancelled).toBe(false); // 不可取消
  });
});

describe('DataPurger 四阶段顺序', () => {
  it('立即模式执行完整四阶段: SafetyLock → Wait → Cascade → Verify', async () => {
    const mock = createMockStore();
    mock.graphStore.createNode('resource/person', { name: '张三', orgId: 'tenant-purge-1' });

    const sessionStore = createMockSessionStore([
      { id: 'ps1', orgId: 'tenant-purge-1' },
    ]);
    const memoryStore = createMockMemoryStore([
      { id: 'pm1', orgId: 'tenant-purge-1', key: 'pk1', value: 'v1', type: 'fact', confidence: 0.9, source: 'manual', tags: [], createdAt: '', updatedAt: '', expiresAt: null, accessCount: 0 },
    ]);
    const purger = new DataPurger(mock.graphStore, sessionStore, memoryStore);

    const result = await purger.purge('tenant-purge-1', true);

    // 验证四个阶段
    expect(result.job.stages.length).toBe(4);
    const stageNames = result.job.stages.map((s: PurgeStage) => s.name);
    expect(stageNames).toEqual(['safety_lock', 'waiting_period', 'cascade_delete', 'verification']);

    // 全部完成
    for (const stage of result.job.stages) {
      expect(stage.status).toBe('completed');
      expect(stage.completedAt).toBeDefined();
    }
  });

  it('级联删除清理了三个存储引擎的数据', async () => {
    const mock = createMockStore();
    // GraphStore: 2个节点属于租户
    mock.graphStore.createNode('resource/person', { name: '张三', orgId: 'tenant-del-1' });
    mock.graphStore.createNode('resource/person', { name: '李四', orgId: 'tenant-del-1' });

    // SessionStore: 1个会话属于租户
    const sessionStore = createMockSessionStore([
      { id: 'ds1', orgId: 'tenant-del-1' },
      { id: 'ds2', orgId: 'other-tenant' }, // 其他租户的不应被删除
    ]);

    // AgentMemoryStore: 1条记忆属于租户
    const memoryStore = createMockMemoryStore([
      { id: 'dm1', orgId: 'tenant-del-1', key: 'k1', value: 'v1', type: 'fact', confidence: 0.9, source: 'manual', tags: [], createdAt: '', updatedAt: '', expiresAt: null, accessCount: 0 },
    ]);

    const purger = new DataPurger(mock.graphStore, sessionStore, memoryStore);
    const result = await purger.purge('tenant-del-1', true);

    // 级联删除阶段完成
    const cascadeStage = result.job.stages[2];
    expect(cascadeStage.status).toBe('completed');

    // 验证残留
    const verifyStage = result.job.stages[3];
    expect(verifyStage.status).toBe('completed');
    expect(verifyStage.detail).toContain('通过');
  });
});

describe('DataPurger 降级处理', () => {
  it('空租户 → 四阶段正常完成', async () => {
    const mock = createMockStore();
    const sessionStore = createMockSessionStore([]);
    const memoryStore = createMockMemoryStore([]);
    const purger = new DataPurger(mock.graphStore, sessionStore, memoryStore);

    const result = await purger.purge('tenant-empty', true);

    expect(result.job.status).toBe('completed');
    expect(result.job.summary?.nodesDeleted).toBe(0);
    expect(result.job.summary?.verificationPassed).toBe(true);
  });

  it('getStatus 返回 null 当任务不存在', () => {
    const mock = createMockStore();
    const sessionStore = createMockSessionStore([]);
    const memoryStore = createMockMemoryStore([]);
    const purger = new DataPurger(mock.graphStore, sessionStore, memoryStore);

    const status = purger.getStatus('nonexistent-id');
    expect(status).toBeNull();
  });
});
