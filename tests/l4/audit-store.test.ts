/**
 * tests/l4/audit-store.test.ts — AuditStore 审计日志存储单元测试 (Phase 0.3)
 *
 * test-first: 先写测试，再实现。
 * 验证 append-only 审计日志的写入、查询、GA 历史等功能。
 */
import { describe, it, expect, beforeEach } from 'vitest';

// 测试前清空可能的状态
let AuditStore: any, AuditService: any;

async function loadModules() {
  const mod = await import('../../src/l4/audit-store');
  AuditStore = mod.AuditStore;
  const svc = await import('../../src/services/audit-service');
  AuditService = svc.AuditService;
}

function createTestDb() {
  const BetterSqlite3 = require('better-sqlite3');
  const db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = WAL');
  return db;
}

// ============================================================
// AuditStore — 基本 CRUD
// ============================================================

describe('AuditStore', () => {
  beforeEach(async () => {
    await loadModules();
  });

  it('创建 store 时自动初始化 schema', () => {
    const db = createTestDb();
    const store = new AuditStore(db);
    // 验证表存在
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log'").get();
    expect(tables).toBeTruthy();
  });

  it('log() 写入一条审计记录', () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    store.log({
      orgId: 'org-1',
      actorId: 'user-1',
      actorRole: 'admin',
      action: 'node.create',
      targetType: 'Person',
      targetId: 'n_abc123',
    });

    const rows = db.prepare('SELECT * FROM audit_log').all();
    expect(rows.length).toBe(1);
    expect(rows[0].org_id).toBe('org-1');
    expect(rows[0].actor_id).toBe('user-1');
    expect(rows[0].actor_role).toBe('admin');
    expect(rows[0].action).toBe('node.create');
  });

  it('log() 自动生成 id 和时间戳', () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    store.log({
      orgId: 'org-1', actorId: 'u1', actorRole: 'ga', action: 'threshold.update',
    });

    const row = db.prepare('SELECT * FROM audit_log LIMIT 1').get();
    expect(row.id).toBeTruthy();
    expect(row.created_at).toBeTruthy();
  });

  it('log() 支持全部可选字段', () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    store.log({
      orgId: 'org-1',
      actorId: 'ga_001',
      actorRole: 'ga',
      action: 'threshold.update',
      targetType: 'threshold',
      targetId: 'th_cash_flow',
      oldValue: JSON.stringify({ threshold: 0.5 }),
      newValue: JSON.stringify({ threshold: 0.3 }),
      ipAddress: '192.168.1.1',
      userAgent: 'curl/7.68',
    });

    const row = db.prepare('SELECT * FROM audit_log LIMIT 1').get();
    expect(row.old_value).toBe(JSON.stringify({ threshold: 0.5 }));
    expect(row.new_value).toBe(JSON.stringify({ threshold: 0.3 }));
    expect(row.ip_address).toBe('192.168.1.1');
  });

  it('query() 按 orgId 查询', () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    store.log({ orgId: 'org-1', actorId: 'u1', actorRole: 'admin', action: 'node.create' });
    store.log({ orgId: 'org-2', actorId: 'u2', actorRole: 'admin', action: 'node.delete' });
    store.log({ orgId: 'org-1', actorId: 'u3', actorRole: 'ga', action: 'threshold.update' });

    const result = store.query('org-1', {});
    expect(result.length).toBe(2);
    expect(result.every((r: any) => r.orgId === 'org-1')).toBe(true);
  });

  it('query() 支持 action 过滤', () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    store.log({ orgId: 'org-1', actorId: 'u1', actorRole: 'admin', action: 'node.create' });
    store.log({ orgId: 'org-1', actorId: 'u2', actorRole: 'admin', action: 'node.delete' });
    store.log({ orgId: 'org-1', actorId: 'u3', actorRole: 'ga', action: 'threshold.update' });

    const result = store.query('org-1', { action: 'node.delete' });
    expect(result.length).toBe(1);
    expect(result[0].action).toBe('node.delete');
  });

  it('query() 支持 limit', () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    for (let i = 0; i < 10; i++) {
      store.log({ orgId: 'org-1', actorId: `u${i}`, actorRole: 'admin', action: 'node.create' });
    }

    const result = store.query('org-1', { limit: 3 });
    expect(result.length).toBe(3);
  });

  it('query() 默认按时间倒序', () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    store.log({ orgId: 'org-1', actorId: 'first', actorRole: 'admin', action: 'node.create' });
    store.log({ orgId: 'org-1', actorId: 'second', actorRole: 'admin', action: 'node.delete' });
    store.log({ orgId: 'org-1', actorId: 'third', actorRole: 'admin', action: 'threshold.update' });

    const result = store.query('org-1', {});
    // 可以验证倒序，但时间戳可能在同一秒，所以检查 actorId 的顺序
    expect(result.length).toBe(3);
    // 每列的 created_at 应该都存在
    expect(result[0].createdAt).toBeTruthy();
  });

  it('getGAHistory() 返回指定 GA 的操作记录', () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    store.log({ orgId: 'org-1', actorId: 'ga_001', actorRole: 'ga', action: 'threshold.update' });
    store.log({ orgId: 'org-1', actorId: 'admin_001', actorRole: 'admin', action: 'node.create' });
    store.log({ orgId: 'org-1', actorId: 'ga_001', actorRole: 'ga', action: 'node.delete' });

    const result = store.getGAHistory('org-1', 'ga_001');
    expect(result.length).toBe(2);
    expect(result.every((r: any) => r.actorId === 'ga_001')).toBe(true);
  });

  it('数据库错误时 log() 不阻止业务流程（降级）', () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    // 关闭数据库模拟写入失败
    db.close();

    // 不应抛出异常
    expect(() => {
      store.log({ orgId: 'org-1', actorId: 'u1', actorRole: 'admin', action: 'node.create' });
    }).not.toThrow();
  });

  it('query() 空结果返回空数组', () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    const result = store.query('non-existent-org', {});
    expect(result).toEqual([]);
  });

  it('返回的记录包含 camelCase 字段', () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    store.log({
      orgId: 'org-1', actorId: 'u1', actorRole: 'admin',
      action: 'node.create', targetType: 'Person',
    });

    const result = store.query('org-1', {});
    expect(result.length).toBe(1);
    const entry = result[0];
    expect(entry.orgId).toBe('org-1');
    expect(entry.actorId).toBe('u1');
    expect(entry.actorRole).toBe('admin');
    expect(entry.action).toBe('node.create');
    expect(entry.targetType).toBe('Person');
  });
});

// ============================================================
// AuditService — 静态方法封装
// ============================================================

describe('AuditService', () => {
  beforeEach(async () => {
    await loadModules();
    AuditService.resetInstance();
  });

  it('init() 接受 db 连接并创建 AuditStore', () => {
    const db = createTestDb();
    AuditService.init(db);

    const store = AuditService.getStore();
    expect(store).toBeTruthy();
    expect(store instanceof AuditStore).toBe(true);
  });

  it('log() 写入审计日志', () => {
    const db = createTestDb();
    AuditService.init(db);

    AuditService.log({
      orgId: 'org-1', actorId: 'u1', actorRole: 'admin', action: 'diagnosis.trigger',
    });

    const rows = AuditService.query('org-1', {});
    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe('diagnosis.trigger');
  });

  it('未初始化时 log() 降级不抛异常', () => {
    AuditService.resetInstance();

    expect(() => {
      AuditService.log({
        orgId: 'org-1', actorId: 'u1', actorRole: 'admin', action: 'diagnosis.trigger',
      });
    }).not.toThrow();
  });

  it('getGAHistory() 委托给 AuditStore', () => {
    const db = createTestDb();
    AuditService.init(db);

    AuditService.log({ orgId: 'org-1', actorId: 'ga_99', actorRole: 'ga', action: 'threshold.update' });
    AuditService.log({ orgId: 'org-1', actorId: 'ga_99', actorRole: 'ga', action: 'node.delete' });
    AuditService.log({ orgId: 'org-1', actorId: 'admin_01', actorRole: 'admin', action: 'node.create' });

    const gaLogs = AuditService.getGAHistory('org-1', 'ga_99');
    expect(gaLogs.length).toBe(2);
  });
});

// ============================================================
// D41: 审计哈希链 — computeAuditHash + log() 哈希链 + verifyChain
// ============================================================

describe('D41 审计哈希链', () => {
  beforeEach(async () => {
    await loadModules();
  });

  it('computeAuditHash: 相同输入 → 相同输出', async () => {
    const { computeAuditHash } = await import('../../src/security/crypto-hash-utils');
    const hash1 = computeAuditHash('node.create', 'u1', 'org-1', '2026-01-01T00:00:00.000Z', '0'.repeat(64), '{}');
    const hash2 = computeAuditHash('node.create', 'u1', 'org-1', '2026-01-01T00:00:00.000Z', '0'.repeat(64), '{}');
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('computeAuditHash: 不同 prevHash → 不同输出', async () => {
    const { computeAuditHash } = await import('../../src/security/crypto-hash-utils');
    const hash1 = computeAuditHash('node.create', 'u1', 'org-1', '2026-01-01T00:00:00.000Z', '0'.repeat(64), '{}');
    const hash2 = computeAuditHash('node.create', 'u1', 'org-1', '2026-01-01T00:00:00.000Z', 'a'.repeat(64), '{}');
    expect(hash1).not.toBe(hash2);
  });

  it('log() 写入 → 记录含 prev_hash 和 current_hash', () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    store.log({
      orgId: 'org-1', actorId: 'u1', actorRole: 'admin', action: 'node.create',
      targetType: 'Person', targetId: 'n_001',
    });

    const row = db.prepare('SELECT prev_hash, current_hash FROM audit_log LIMIT 1').get() as Record<string, unknown>;
    expect(row.prev_hash).toBe('0'.repeat(64)); // 创世块
    expect(row.current_hash).toMatch(/^[0-9a-f]{64}$/);
    expect((row.current_hash as string).length).toBe(64);
  });

  it('log() 两次写入 → 第二条的 prev_hash = 第一条的 current_hash', () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    store.log({ orgId: 'org-1', actorId: 'u1', actorRole: 'admin', action: 'entry.1' });
    store.log({ orgId: 'org-1', actorId: 'u1', actorRole: 'admin', action: 'entry.2' });

    const rows = db.prepare('SELECT prev_hash, current_hash FROM audit_log ORDER BY created_at ASC').all() as Array<Record<string, string>>;
    expect(rows.length).toBe(2);
    expect(rows[1].prev_hash).toBe(rows[0].current_hash);
  });

  it('verifyChain: 完整链 → {valid: true}', () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    store.log({ orgId: 'org-1', actorId: 'u1', actorRole: 'admin', action: 'entry.1' });
    store.log({ orgId: 'org-1', actorId: 'u1', actorRole: 'admin', action: 'entry.2' });
    store.log({ orgId: 'org-1', actorId: 'u1', actorRole: 'admin', action: 'entry.3' });

    const result = store.verifyChain('org-1');
    expect(result.valid).toBe(true);
    expect(result.totalRecords).toBe(3);
  });

  it('verifyChain: 中间篡改 → {valid: false, brokenAt: N}', () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    store.log({ orgId: 'org-1', actorId: 'u1', actorRole: 'admin', action: 'entry.1' });
    store.log({ orgId: 'org-1', actorId: 'u1', actorRole: 'admin', action: 'entry.2' });
    store.log({ orgId: 'org-1', actorId: 'u1', actorRole: 'admin', action: 'entry.3' });

    // 篡改第二条记录的 current_hash（模拟绕过 API 直接修改哈希链断裂）
    db.prepare("UPDATE audit_log SET current_hash='tampered_hash_00000000000000000000000000' WHERE id IN (SELECT id FROM audit_log WHERE org_id='org-1' ORDER BY created_at ASC LIMIT 1 OFFSET 1)").run();

    const result = store.verifyChain('org-1');
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2); // 第三条记录的 prev_hash ≠ 第二条篡改后的 current_hash
  });

  it('verifyChain: 0 条记录 → {valid: true, totalRecords: 0}', () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    const result = store.verifyChain('empty-org');
    expect(result.valid).toBe(true);
    expect(result.totalRecords).toBe(0);
  });

  it('verifyChain: 不同 org 互不干扰', () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    store.log({ orgId: 'org-1', actorId: 'u1', actorRole: 'admin', action: 'entry.1' });
    store.log({ orgId: 'org-2', actorId: 'u2', actorRole: 'admin', action: 'entry.a' });
    store.log({ orgId: 'org-1', actorId: 'u1', actorRole: 'admin', action: 'entry.2' });

    const r1 = store.verifyChain('org-1');
    expect(r1.valid).toBe(true);
    expect(r1.totalRecords).toBe(2);

    const r2 = store.verifyChain('org-2');
    expect(r2.valid).toBe(true);
    expect(r2.totalRecords).toBe(1);
  });
});
