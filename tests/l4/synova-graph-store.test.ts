import { describe, it, expect } from 'vitest';
import { SqliteGraphStore } from '../../src/adapters/sqlite-graph-store';

// 内存 SQLite — 使用 better-sqlite3
function createTestDb() {
  const BetterSqlite3 = require('better-sqlite3');
  const db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = WAL');
  return db;
}

describe('SqliteGraphStore (D286 统一后原生实现)', () => {
  it('创建 + 查询节点', () => {
    const db = createTestDb();
    const store = new SqliteGraphStore(db);
    const id = store.createNode('Person', { name: '张三', teamId: 't1' }, 'default');
    expect(id).toBeTruthy();
    expect(id).toMatch(/^node-/);

    const nodes = store.queryNodes('Person', {}, 'default');
    expect(nodes.length).toBeGreaterThanOrEqual(1);
    expect(nodes[0].props.name).toBe('张三');
  });

  it('创建 + 查询边', () => {
    const db = createTestDb();
    const store = new SqliteGraphStore(db);
    const a = store.createNode('Person', { name: '张三' }, 'default');
    const b = store.createNode('Team', { name: '研发部' }, 'default');
    const eid = store.createEdge('MEMBER_OF', a, b, 1.0, {}, 'default');
    expect(eid).toBeTruthy();

    const edges = store.queryEdges('MEMBER_OF', a, undefined, 'default');
    expect(edges.length).toBeGreaterThanOrEqual(1);
    expect(edges[0].to).toBe(b);
  });

  it('getNode + updateNode', () => {
    const db = createTestDb();
    const store = new SqliteGraphStore(db);
    const id = store.createNode('Person', { name: '张三', age: 30 }, 'default');

    const node = store.getNode(id, 'default');
    expect(node).not.toBeNull();
    expect(node!.props.name).toBe('张三');

    store.updateNode(id, { name: '张三', age: 31 }, 'default');
    const updated = store.getNode(id, 'default');
    expect(updated!.props.age).toBe(31);
  });

  it('deleteNode — 软删除', () => {
    const db = createTestDb();
    const store = new SqliteGraphStore(db);
    const id = store.createNode('Person', { name: '李四' }, 'default');

    store.deleteNode(id, 'default');
    const nodes = store.queryNodes('Person', {}, 'default');
    expect(nodes.filter(n => n.id === id).length).toBe(0);
  });

  it('deleteEdge — 软删除', () => {
    const db = createTestDb();
    const store = new SqliteGraphStore(db);
    const a = store.createNode('Person', { name: '张三' }, 'default');
    const b = store.createNode('Team', { name: '研发部' }, 'default');
    const eid = store.createEdge('MEMBER_OF', a, b, 1.0, {}, 'default');

    store.deleteEdge(eid, 'default');
    const edges = store.queryEdges('MEMBER_OF', undefined, undefined, 'default');
    expect(edges.filter(e => e.id === eid).length).toBe(0);
  });

  it('queryTriples — 三元组模式查询', () => {
    const db = createTestDb();
    const store = new SqliteGraphStore(db);
    const a = store.createNode('Person', { name: '张三' }, 'default');
    const b = store.createNode('Team', { name: '研发部' }, 'default');
    store.createEdge('MEMBER_OF', a, b, 1.0, {}, 'default');

    const triples = store.queryTriples({ predicate: 'MEMBER_OF' }, 'default');
    expect(triples.length).toBeGreaterThanOrEqual(1);
  });

  it('空查询返回空数组不崩溃', () => {
    const db = createTestDb();
    const store = new SqliteGraphStore(db);
    expect(store.queryNodes('NonExistent', {}, 'default')).toEqual([]);
    expect(store.queryEdges('NonExistent', undefined, undefined, 'default')).toEqual([]);
    expect(store.getNode('nope', 'default')).toBeNull();
  });
});
