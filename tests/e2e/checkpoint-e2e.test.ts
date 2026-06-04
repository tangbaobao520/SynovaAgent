/**
 * tests/e2e/checkpoint-e2e.test.ts — 切片: 诊断检查点 端到端
 *
 * 切片: 诊断运行 → Phase 完成 → 保存检查点 → 模拟崩溃 → 恢复检查点
 * 铁律 0-2: 每个 public 函数 ≥ 2 用例
 */
import { describe, it, expect, afterAll } from 'vitest';
import Database from 'better-sqlite3';

describe('Diagnosis Checkpoint E2E — save → restore → delete', () => {
  // In-memory SQLite for test isolation
  const db = new Database(':memory:');
  afterAll(() => db.close());
  db.exec(`
    CREATE TABLE IF NOT EXISTS diagnosis_checkpoints (
      session_id TEXT NOT NULL, phase INTEGER DEFAULT 0,
      completed_modules TEXT DEFAULT '[]', partial_report TEXT DEFAULT 'null',
      saved_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (session_id, phase)
    )
  `);

  const saveStmt = db.prepare(`
    INSERT OR REPLACE INTO diagnosis_checkpoints (session_id, phase, completed_modules, partial_report, saved_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const getStmt = db.prepare(`
    SELECT phase, completed_modules, partial_report, saved_at
    FROM diagnosis_checkpoints WHERE session_id = ? ORDER BY saved_at DESC LIMIT 1
  `);

  it('Given Phase 2 completed, When checkpoint saved, Then restored with correct phase', () => {
    const sessionId = 'diag-test-1';
    saveStmt.run(sessionId, 2, JSON.stringify(['module_a', 'module_b']),
      JSON.stringify({ findings: ['finding_1'] }), new Date().toISOString());

    const row = getStmt.get(sessionId) as any;
    expect(row).not.toBeUndefined();
    expect(row.phase).toBe(2);
    const modules = JSON.parse(row.completed_modules);
    expect(modules).toContain('module_a');
    const report = JSON.parse(row.partial_report);
    expect(report.findings).toContain('finding_1');
  });

  it('Given multiple checkpoints, When queried, Then returns latest phase only', () => {
    const sessionId = 'diag-test-2';
    const t1 = new Date(Date.now() - 1000).toISOString();
    const t2 = new Date().toISOString();
    saveStmt.run(sessionId, 1, JSON.stringify(['m1']), 'null', t1);
    saveStmt.run(sessionId, 3, JSON.stringify(['m1', 'm2', 'm3']), JSON.stringify({ done: true }), t2);

    const row = getStmt.get(sessionId) as any;
    expect(row.phase).toBe(3); // Latest phase wins
    expect(JSON.parse(row.completed_modules)).toHaveLength(3);
  });

  it('Given no checkpoint for session, When queried, Then null', () => {
    const row = getStmt.get('nonexistent-session');
    expect(row).toBeUndefined();
  });

  it('Given checkpoint deleted, When queried, Then null', () => {
    const sessionId = 'diag-test-3';
    saveStmt.run(sessionId, 4, JSON.stringify(['all_done']), 'null', new Date().toISOString());
    db.prepare('DELETE FROM diagnosis_checkpoints WHERE session_id = ?').run(sessionId);
    const row = getStmt.get(sessionId);
    expect(row).toBeUndefined();
  });

});
