/**
 * tests/evidence/evidence-store-d37.test.ts — D37 数据冲突字段扩展
 *
 * 覆盖: DDL has_conflict/conflict_versions 列存在性 / add() 写入与查询
 * 约束: ALTER TABLE ADD COLUMN（不重建表）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { EvidenceStore } from '../../src/evidence/evidence-store';
import type { Evidence } from '../../src/evidence/types';

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    source: 'diagnosis',
    sourceId: 'test-org',
    type: 'data-conflict',
    content: '冲突检测测试',
    confidence: 1.0,
    collectedAt: new Date().toISOString(),
    orgId: 'test-org',
    ...overrides,
  };
}

describe('EvidenceStore — D37 has_conflict 扩展', () => {
  let db: Database.Database;
  let store: EvidenceStore;

  beforeEach(() => {
    db = new Database(':memory:');
    store = new EvidenceStore(db);
  });

  it('DDL — has_conflict 和 conflict_versions 列存在', () => {
    const columns = db.prepare('PRAGMA table_info(evidence)').all() as Array<{ name: string; type: string }>;
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('has_conflict');
    expect(colNames).toContain('conflict_versions');
  });

  it('写入 has_conflict=1 后查询返回 has_conflict=1', () => {
    store.add(makeEvidence({ id: 'conflict-ev-1', hasConflict: 1 }));
    const results = store.query({ orgId: 'test-org' });
    expect(results).toHaveLength(1);
    expect(results[0].hasConflict).toBe(1);
  });

  it('写入 has_conflict=0 后查询返回 0', () => {
    store.add(makeEvidence({ id: 'no-conflict', hasConflict: 0 }));
    const results = store.query({ orgId: 'test-org' });
    expect(results[0].hasConflict).toBe(0);
  });

  it('写入 conflictVersions JSON 后可读取', () => {
    const versions = JSON.stringify([{ value: { name: 'v1' }, recordedAt: '2026-01-01' }]);
    store.add(makeEvidence({ id: 'conflict-v', hasConflict: 1, conflictVersions: versions }));
    const results = store.query({ orgId: 'test-org' });
    expect(results[0].conflictVersions).toBe(versions);
    const parsed = JSON.parse(results[0].conflictVersions!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].value.name).toBe('v1');
  });

  it('无冲突证据默认 hasConflict=null', () => {
    store.add(makeEvidence({ id: 'normal-ev', hasConflict: undefined }));
    const results = store.query({ orgId: 'test-org' });
    // SQLite INTEGER DEFAULT 0 但写入时传 null → 存储为 NULL
    expect(results[0].hasConflict).toBeNull();
  });

  it('query 列别名 — hasConflict 和 conflictVersions 可正确映射', () => {
    store.add(makeEvidence({ id: 'alias-test', hasConflict: 1, conflictVersions: '[]' }));
    const results = store.query({ orgId: 'test-org' });
    expect(results[0].hasConflict).toBe(1);
    expect(results[0].conflictVersions).toBe('[]');
  });
});
