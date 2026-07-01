/**
 * tests/l4/synova-graph-store-permission.test.ts — GraphStore 权限检查单元测试 (Phase 0.2)
 *
 * test-first: 先写测试，再实现。
 * 验证 deleteNode/deleteEdge 在权限不足时抛出 PermissionDeniedError。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createSynovaGraphStore,
  setGraphStoreDeletePermissionChecker,
  clearGraphStoreDeletePermissionChecker,
  type SynovaGraphStore,
} from '@synova/graph-store';
import { PermissionDeniedError } from '@synova/error-types';

// ============================================================
// 辅助函数
// ============================================================

function createTestDb() {
  const BetterSqlite3 = require('better-sqlite3');
  const db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = WAL');
  return db;
}

function seedTestData(store: SynovaGraphStore): { nodeId: string; edgeId: string } {
  const nodeA = store.createNode('Person', { name: '测试用户' }, 'default');
  const nodeB = store.createNode('Team', { name: '测试团队' }, 'default');
  const edgeId = store.createEdge('MEMBER_OF', nodeA, nodeB, 1.0, {}, 'default');
  return { nodeId: nodeA, edgeId };
}

// ============================================================
// 兼容性：无检查器时向后兼容
// ============================================================

describe('GraphStore delete — 无权限检查器（向后兼容）', () => {
  beforeEach(() => {
    clearGraphStoreDeletePermissionChecker();
  });

  it('deleteNode 在无检查器时正常执行', () => {
    const db = createTestDb();
    const store = createSynovaGraphStore(db);
    const { nodeId } = seedTestData(store);

    expect(() => store.deleteNode(nodeId, 'default')).not.toThrow();
    const nodes = store.queryNodes('Person', {}, 'default');
    expect(nodes.filter(n => n.id === nodeId).length).toBe(0);
  });

  it('deleteEdge 在无检查器时正常执行', () => {
    const db = createTestDb();
    const store = createSynovaGraphStore(db);
    const { edgeId } = seedTestData(store);

    expect(() => store.deleteEdge(edgeId, 'default')).not.toThrow();
    const edges = store.queryEdges('MEMBER_OF', undefined, undefined, 'default');
    expect(edges.filter(e => e.id === edgeId).length).toBe(0);
  });

  it('createNode/queryNodes 不受检查器影响', () => {
    const db = createTestDb();
    const store = createSynovaGraphStore(db);

    setGraphStoreDeletePermissionChecker(() => ({ allowed: false, reason: 'test' }));
    const id = store.createNode('Person', { name: '只读测试' }, 'default');
    expect(id).toBeTruthy();

    const nodes = store.queryNodes('Person', {}, 'default');
    expect(nodes.some(n => n.id === id)).toBe(true);
  });
});

// ============================================================
// 权限拒绝场景
// ============================================================

describe('GraphStore delete — 权限拒绝', () => {
  beforeEach(() => {
    clearGraphStoreDeletePermissionChecker();
  });

  afterEach(() => {
    clearGraphStoreDeletePermissionChecker();
  });

  it('deleteNode 权限不足 → 抛出 PermissionDeniedError', () => {
    const db = createTestDb();
    const store = createSynovaGraphStore(db);
    const { nodeId } = seedTestData(store);

    // 设置检查器：拒绝所有删除
    setGraphStoreDeletePermissionChecker(() => ({
      allowed: false,
      reason: '仅 admin/owner 可删除数据',
    }));

    expect(() => store.deleteNode(nodeId, 'default')).toThrow(PermissionDeniedError);
  });

  it('deleteEdge 权限不足 → 抛出 PermissionDeniedError', () => {
    const db = createTestDb();
    const store = createSynovaGraphStore(db);
    const { edgeId } = seedTestData(store);

    setGraphStoreDeletePermissionChecker(() => ({
      allowed: false,
      reason: '仅 admin/owner 可删除数据',
    }));

    expect(() => store.deleteEdge(edgeId, 'default')).toThrow(PermissionDeniedError);
  });

  it('PermissionDeniedError 包含正确 code/retryable/phase', () => {
    const db = createTestDb();
    const store = createSynovaGraphStore(db);
    const { nodeId } = seedTestData(store);

    setGraphStoreDeletePermissionChecker(() => ({
      allowed: false,
      reason: '权限测试',
    }));

    try {
      store.deleteNode(nodeId, 'default');
      expect.unreachable('应该抛出异常');
    } catch (err) {
      expect(err).toBeInstanceOf(PermissionDeniedError);
      const permErr = err as PermissionDeniedError;
      expect(permErr.code).toBe('PERMISSION_DENIED');
      expect(permErr.retryable).toBe(false);
      expect(permErr.message).toContain('权限测试');
    }
  });

  it('拒绝后数据不被删除（软删除未执行）', () => {
    const db = createTestDb();
    const store = createSynovaGraphStore(db);
    const { nodeId } = seedTestData(store);

    setGraphStoreDeletePermissionChecker(() => ({
      allowed: false,
      reason: '拒绝删除',
    }));

    try { store.deleteNode(nodeId, 'default'); } catch { /* 预期异常 */ }

    // 数据应该还在
    const node = store.getNode(nodeId, 'default');
    expect(node).not.toBeNull();
  });
});

// ============================================================
// 权限允许场景
// ============================================================

describe('GraphStore delete — 权限允许', () => {
  beforeEach(() => {
    clearGraphStoreDeletePermissionChecker();
  });

  afterEach(() => {
    clearGraphStoreDeletePermissionChecker();
  });

  it('deleteNode 权限允许 → 正常删除', () => {
    const db = createTestDb();
    const store = createSynovaGraphStore(db);
    const { nodeId } = seedTestData(store);

    setGraphStoreDeletePermissionChecker(() => ({ allowed: true }));

    expect(() => store.deleteNode(nodeId, 'default')).not.toThrow();
    const nodes = store.queryNodes('Person', {}, 'default');
    expect(nodes.filter(n => n.id === nodeId).length).toBe(0);
  });

  it('deleteEdge 权限允许 → 正常删除', () => {
    const db = createTestDb();
    const store = createSynovaGraphStore(db);
    const { edgeId } = seedTestData(store);

    setGraphStoreDeletePermissionChecker(() => ({ allowed: true }));

    expect(() => store.deleteEdge(edgeId, 'default')).not.toThrow();
    const edges = store.queryEdges('MEMBER_OF', undefined, undefined, 'default');
    expect(edges.filter(e => e.id === edgeId).length).toBe(0);
  });

  it('检查器可被动态替换', () => {
    const db = createTestDb();
    const store = createSynovaGraphStore(db);
    const { nodeId } = seedTestData(store);

    // 先拒绝
    setGraphStoreDeletePermissionChecker(() => ({ allowed: false, reason: 'test' }));
    expect(() => store.deleteNode(nodeId, 'default')).toThrow(PermissionDeniedError);

    // 切换为允许
    setGraphStoreDeletePermissionChecker(() => ({ allowed: true }));
    expect(() => store.deleteNode(nodeId, 'default')).not.toThrow();
  });

  it('检查器可被清除（设为 null 回到无条件允许）', () => {
    const db = createTestDb();
    const store = createSynovaGraphStore(db);
    const { nodeId } = seedTestData(store);

    setGraphStoreDeletePermissionChecker(() => ({ allowed: false, reason: 'test' }));
    expect(() => store.deleteNode(nodeId, 'default')).toThrow(PermissionDeniedError);

    clearGraphStoreDeletePermissionChecker();
    // 新数据重新测
    const { nodeId: newNodeId } = seedTestData(store);
    expect(() => store.deleteNode(newNodeId, 'default')).not.toThrow();
  });
});

// ============================================================
// 导出 API
// ============================================================

describe('setGraphStoreDeletePermissionChecker 导出', () => {
  it('setGraphStoreDeletePermissionChecker 是可调用的函数', () => {
    expect(typeof setGraphStoreDeletePermissionChecker).toBe('function');
  });

  it('clearGraphStoreDeletePermissionChecker 是可调用的函数', () => {
    expect(typeof clearGraphStoreDeletePermissionChecker).toBe('function');
  });
});
