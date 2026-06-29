import { describe, it, expect } from 'vitest';
import { createSynovaGraphStore, type SynovaGraphStore } from '@synova/graph-store';

// 内存 SQLite — 使用 better-sqlite3
function createTestDb() {
  const BetterSqlite3 = require('better-sqlite3');
  const db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = WAL');
  return db;
}

describe('SynovaGraphStore', () => {
  it('创建 + 查询节点', () => {
    const db = createTestDb();
    const store = createSynovaGraphStore(db);
    const id = store.createNode('Person', { name: '张三', teamId: 't1' }, 'default');
    expect(id).toBeTruthy();
    expect(id).toMatch(/^n_/);

    const nodes = store.queryNodes('Person', {}, 'default');
    expect(nodes.length).toBeGreaterThanOrEqual(1);
    expect(nodes[0].props.name).toBe('张三');
  });

  it('创建 + 查询边', () => {
    const db = createTestDb();
    const store = createSynovaGraphStore(db);
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
    const store = createSynovaGraphStore(db);
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
    const store = createSynovaGraphStore(db);
    const id = store.createNode('Person', { name: '李四' }, 'default');

    store.deleteNode(id, 'default');
    const nodes = store.queryNodes('Person', {}, 'default');
    expect(nodes.filter(n => n.id === id).length).toBe(0);
  });

  it('批量创建节点 + 边', () => {
    const db = createTestDb();
    const store = createSynovaGraphStore(db);
    const ids = store.createNodes([
      { type: 'Person', props: { name: '张三' } },
      { type: 'Person', props: { name: '李四' } },
      { type: 'Person', props: { name: '王五' } },
    ], 'default');
    expect(ids.filter(Boolean).length).toBe(3);

    store.createEdges([
      { type: 'REPORTS_TO', from: ids[1], to: ids[0] },
      { type: 'REPORTS_TO', from: ids[2], to: ids[0] },
    ], 'default');

    const edges = store.queryEdges('REPORTS_TO', undefined, undefined, 'default');
    expect(edges.length).toBe(2);
  });

  it('traverse 图遍历', () => {
    const db = createTestDb();
    const store = createSynovaGraphStore(db);
    const a = store.createNode('Person', { name: '张三' }, 'default');
    const b = store.createNode('Person', { name: '李四' }, 'default');
    const c = store.createNode('Person', { name: '王五' }, 'default');
    store.createEdge('REPORTS_TO', b, a, 1.0, {}, 'default');
    store.createEdge('REPORTS_TO', c, b, 1.0, {}, 'default');

    const result = store.traverse(a, 'REPORTS_TO', 3, 'default') as Array<{ depth: number }>;
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('findPaths 路径查找', () => {
    const db = createTestDb();
    const store = createSynovaGraphStore(db);
    const a = store.createNode('Person', { name: '张三' }, 'default');
    const b = store.createNode('Person', { name: '李四' }, 'default');
    store.createEdge('REPORTS_TO', b, a, 1.0, {}, 'default');

    const paths = store.findPaths(b, a, 'REPORTS_TO', 4, 'default');
    expect(paths.length).toBeGreaterThanOrEqual(1);
  });

  it('getNodeAtTime — 时间点查询', () => {
    const db = createTestDb();
    const store = createSynovaGraphStore(db);
    const id = store.createNode('Person', { name: '历史快照' }, 'default');

    const node = store.getNodeAtTime(id, new Date().toISOString(), 'default');
    expect(node).not.toBeNull();
    expect(node!.props.name).toBe('历史快照');
  });

  it('queryTriples — 三元组模式查询', () => {
    const db = createTestDb();
    const store = createSynovaGraphStore(db);
    const a = store.createNode('Person', { name: '张三' }, 'default');
    const b = store.createNode('Team', { name: '研发部' }, 'default');
    store.createEdge('MEMBER_OF', a, b, 1.0, {}, 'default');

    const triples = store.queryTriples({ predicate: 'MEMBER_OF' }, 'default');
    expect(triples.length).toBeGreaterThanOrEqual(1);
  });

  it('空查询返回空数组不崩溃', () => {
    const db = createTestDb();
    const store = createSynovaGraphStore(db);
    expect(store.queryNodes('NonExistent', {}, 'default')).toEqual([]);
    expect(store.queryEdges('NonExistent', undefined, undefined, 'default')).toEqual([]);
    expect(store.getNode('nope', 'default')).toBeNull();
  });
});
