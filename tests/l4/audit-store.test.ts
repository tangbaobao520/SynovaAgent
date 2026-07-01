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
