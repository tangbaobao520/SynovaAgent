import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { KnowledgeConflictHandler } from '../../src/agent/knowledge-conflict-handler';

describe('KnowledgeConflictHandler', () => {
  let db: Database.Database;
  let handler: KnowledgeConflictHandler;

  beforeEach(() => {
    db = new Database(':memory:');
    handler = new KnowledgeConflictHandler(db);
  });

  it('Given 新冲突, When report, Then 返回带id的记录', () => {
    const conflict = handler.report({
      dimension: '竞品定义',
      sources: ['knowledge/industry/manufacturing.md', 'knowledge/custom/acme/competitive.md'],
      resolution: 'manual_review',
      timestamp: new Date().toISOString(),
      status: 'open',
    });
    expect(conflict.id).toBeTruthy();
    expect(conflict.id.startsWith('kc_')).toBe(true);
    expect(conflict.dimension).toBe('竞品定义');
  });

  it('Given 已记录冲突, When listOpen, Then 返回open列表', () => {
    handler.report({
      dimension: '定价基准',
      sources: ['a.md', 'b.md'],
      resolution: 'manual_review',
      timestamp: new Date().toISOString(),
      status: 'open',
    });
    const open = handler.listOpen();
    expect(open.length).toBeGreaterThanOrEqual(1);
    expect(open[0].dimension).toBe('定价基准');
  });

  it('Given open冲突, When resolve, Then status变为resolved', () => {
    const c = handler.report({
      dimension: '阈值',
      sources: ['x.md', 'y.md'],
      resolution: 'manual_review',
      timestamp: new Date().toISOString(),
      status: 'open',
    });
    const resolved = handler.resolve(c.id, 'keep_higher_priority', 'FDE-tester', '选择客户版本');
    expect(resolved).toBeTruthy();
    expect(resolved!.status).toBe('resolved');
    expect(resolved!.resolvedBy).toBe('FDE-tester');
  });

  it('Given 不存在id, When resolve, Then 返回null', () => {
    const result = handler.resolve('nonexistent', 'merge', 'test');
    expect(result).toBeNull();
  });

  it('Given 已解决冲突, When listOpen, Then 不再出现', () => {
    const c = handler.report({
      dimension: 'test',
      sources: ['a.md'],
      resolution: 'manual_review',
      timestamp: new Date().toISOString(),
      status: 'open',
    });
    handler.resolve(c.id, 'merge', 'test');
    const open = handler.listOpen();
    expect(open.find(o => o.id === c.id)).toBeUndefined();
  });

  it('Given 2个open, When countByStatus, Then open=2 resolved=0', () => {
    handler.report({ dimension:'a', sources:['a.md'], resolution:'manual_review', timestamp:new Date().toISOString(), status:'open' });
    handler.report({ dimension:'b', sources:['b.md'], resolution:'manual_review', timestamp:new Date().toISOString(), status:'open' });
    const counts = handler.countByStatus();
    expect(counts.open).toBe(2);
    expect(counts.resolved).toBe(0);
  });
});
