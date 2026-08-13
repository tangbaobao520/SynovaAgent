/**
 * tests/l4/synova-graph-store-permission.test.ts — GraphStore 删除语义测试 (D286 迁移)
 *
 * D286: 旧 synova/graph-store 包的删除权限检查器（setGraphStoreDeletePermissionChecker）已废弃。
 * 原生 SqliteGraphStore 的删除路径无权限门，行为等价于旧包"总是允许"语义
 * （bootstrap 曾调用 setGraphStoreDeletePermissionChecker(() => ({allowed:true}))）。
 * 本测试验证迁移后的删除行为：deleteNode/deleteEdge 总是正常执行（软删除）。
 */
import { describe, it, expect } from 'vitest';
import { SqliteGraphStore } from '../../src/adapters/sqlite-graph-store';

// ============================================================
// 辅助函数
// ============================================================

function createTestDb() {
  const BetterSqlite3 = require('better-sqlite3');
  const db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = WAL');
  return db;
}

function seedTestData(store: SqliteGraphStore): { nodeId: string; edgeId: string } {
  const nodeA = store.createNode('Person', { name: '测试用户' }, 'default');
  const nodeB = store.createNode('Team', { name: '测试团队' }, 'default');
  const edgeId = store.createEdge('MEMBER_OF', nodeA, nodeB, 1.0, {}, 'default');
  return { nodeId: nodeA, edgeId };
}

// ============================================================
// 删除语义 — 总是允许（旧权限机制已废弃，行为等价）
// ============================================================

describe('SqliteGraphStore delete — 总是允许（原权限机制语义等价）', () => {
  it('deleteNode 正常执行（软删除）', () => {
    const db = createTestDb();
    const store = new SqliteGraphStore(db);
    const { nodeId } = seedTestData(store);

    expect(() => store.deleteNode(nodeId, 'default')).not.toThrow();
    const nodes = store.queryNodes('Person', {}, 'default');
    expect(nodes.filter(n => n.id === nodeId).length).toBe(0);
  });

  it('deleteEdge 正常执行（软删除）', () => {
    const db = createTestDb();
    const store = new SqliteGraphStore(db);
    const { edgeId } = seedTestData(store);

    expect(() => store.deleteEdge(edgeId, 'default')).not.toThrow();
    const edges = store.queryEdges('MEMBER_OF', undefined, undefined, 'default');
    expect(edges.filter(e => e.id === edgeId).length).toBe(0);
  });

  it('createNode/queryNodes 不受删除影响', () => {
    const db = createTestDb();
    const store = new SqliteGraphStore(db);
    const id = store.createNode('Person', { name: '只读测试' }, 'default');
    expect(id).toBeTruthy();

    const nodes = store.queryNodes('Person', {}, 'default');
    expect(nodes.some(n => n.id === id)).toBe(true);
  });
});

// ============================================================
// 软删除语义 — 历史数据保留
// ============================================================

describe('SqliteGraphStore delete — 软删除保留历史 (valid_to)', () => {
  it('删除后原节点数据仍在表中（时间线保留）', () => {
    const db = createTestDb();
    const store = new SqliteGraphStore(db);
    const { nodeId } = seedTestData(store);

    store.deleteNode(nodeId, 'default');

    // 物理行仍存在 — 软删除只置 valid_to
    const row = db.prepare('SELECT valid_to FROM graph_nodes WHERE id = ?').get(nodeId) as { valid_to: string | null };
    expect(row.valid_to).not.toBeNull();
  });

  it('删除不影响其他节点', () => {
    const db = createTestDb();
    const store = new SqliteGraphStore(db);
    const { nodeId } = seedTestData(store);
    const other = store.createNode('Person', { name: '保留用户' }, 'default');

    store.deleteNode(nodeId, 'default');

    const nodes = store.queryNodes('Person', {}, 'default');
    expect(nodes.some(n => n.id === other)).toBe(true);
    expect(nodes.some(n => n.id === nodeId)).toBe(false);
  });
});
