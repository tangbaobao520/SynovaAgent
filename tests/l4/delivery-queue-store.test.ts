/**
 * tests/l4/delivery-queue-store.test.ts — Phase 2.1 持久投递队列存储测试
 *
 * 铁律 0-2: spec → test → impl → wire → review → merge
 * 铁律 33: *.test.ts 单元测试 (使用 :memory: SQLite)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';

let DeliveryQueueStore: any;

async function loadModules() {
  const mod = await import('../../src/l4/delivery-queue-store');
  DeliveryQueueStore = mod.DeliveryQueueStore;
}

function createTestDb(): Database.Database {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const BetterSqlite3 = require('better-sqlite3');
  const db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = WAL');
  return db;
}

describe('DeliveryQueueStore — Schema', () => {
  beforeEach(async () => { await loadModules(); });

  it('新建实例应创建 delivery_queue 表', () => {
    const db = createTestDb();
    const store = new DeliveryQueueStore(db);

    // 验证表存在
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='delivery_queue'").all();
    expect(rows).toHaveLength(1);
  });
});

describe('DeliveryQueueStore — enqueue', () => {
  let db: Database.Database;
  let store: any;

  beforeEach(async () => {
    await loadModules();
    db = createTestDb();
    store = new DeliveryQueueStore(db);
  });

  it('enqueue 应返回带 id 的条目', () => {
    const entry = store.enqueue({
      orgId: 'org1',
      targetType: 'notification',
      targetId: 'user_001',
      payload: JSON.stringify({ title: '测试通知' }),
    });

    expect(entry.id).toBeTruthy();
    expect(entry.status).toBe('pending');
    expect(entry.retryCount).toBe(0);
  });

  it('enqueue 应持久化到数据库', () => {
    store.enqueue({ orgId: 'org1', targetType: 'message', targetId: 'sess_001', payload: '{}' });

    const row = db.prepare('SELECT * FROM delivery_queue').get() as any;
    expect(row).toBeTruthy();
    expect(row.org_id).toBe('org1');
  });

  it('enqueue 应支持重复去重', () => {
    const a = store.enqueue({ orgId: 'org1', targetType: 'notification', targetId: 'u1', payload: '{}' });
    const b = store.enqueue({ orgId: 'org1', targetType: 'notification', targetId: 'u1', payload: '{}' });

    // 相同 target_type + target_id → 重复
    expect(a.id).toBe(b.id);
  });
});

describe('DeliveryQueueStore — dequeue / mark', () => {
  let db: Database.Database;
  let store: any;

  beforeEach(async () => {
    await loadModules();
    db = createTestDb();
    store = new DeliveryQueueStore(db);
  });

  it('dequeue 应返回最旧的 pending 条目', () => {
    store.enqueue({ orgId: 'org1', targetType: 'message', targetId: 's1', payload: '{"seq":1}' });
    store.enqueue({ orgId: 'org1', targetType: 'message', targetId: 's2', payload: '{"seq":2}' });

    const entry = store.dequeue();
    expect(entry).toBeTruthy();
    expect(entry!.status).toBe('pending');
  });

  it('无 pending 条目时 dequeue 应返回 null', () => {
    const entry = store.dequeue();
    expect(entry).toBeNull();
  });

  it('markDelivered 应更新状态', () => {
    const e = store.enqueue({ orgId: 'org1', targetType: 'message', targetId: 's1', payload: '{}' });
    store.markDelivered(e.id);

    const row = db.prepare('SELECT * FROM delivery_queue WHERE id=?').get(e.id) as any;
    expect(row.status).toBe('delivered');
    expect(row.delivered_at).toBeTruthy();
  });

  it('markFailed 应递增重试次数', () => {
    const e = store.enqueue({ orgId: 'org1', targetType: 'message', targetId: 's1', payload: '{}' });
    store.markFailed(e.id);

    const row = db.prepare('SELECT * FROM delivery_queue WHERE id=?').get(e.id) as any;
    expect(row.retry_count).toBe(1);
  });

  it('peekPending 应返回所有待投递条目', () => {
    store.enqueue({ orgId: 'org1', targetType: 'message', targetId: 's1', payload: '{}' });
    store.enqueue({ orgId: 'org1', targetType: 'alert', targetId: 's2', payload: '{}' });
    const e = store.enqueue({ orgId: 'org1', targetType: 'notification', targetId: 'u1', payload: '{}' });
    store.markDelivered(e.id);

    const pending = store.peekPending();
    expect(pending).toHaveLength(2);
  });
});
