/**
 * tests/security/root-hash-publisher.test.ts — D41 根哈希发布器单元测试
 *
 * 覆盖:
 * - external-hash-store: 本地文件写入+读取
 * - RootHashPublisher: 手动发布+降级
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ============================================================
// Helpers
// ============================================================

function createTestDb() {
  const BetterSqlite3 = require('better-sqlite3');
  const db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = WAL');
  return db;
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'd41-hash-test-'));
}

// ============================================================
// external-hash-store
// ============================================================

describe('LocalFileHashStore', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = tmpDir();
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('publish() 写入文件 → 文件存在且内容正确', async () => {
    const { LocalFileHashStore } = await import('../../src/security/external-hash-store');
    const store = new LocalFileHashStore(testDir);

    const result = await store.publish('org-1', 'a'.repeat(64), '2026-07-17T00:00:00.000Z', 'sig123');
    expect(result.stored).toBe(true);
    expect(result.location).toBeTruthy();
    expect(fs.existsSync(result.location)).toBe(true);

    const content = JSON.parse(fs.readFileSync(result.location, 'utf-8'));
    expect(content.orgId).toBe('org-1');
    expect(content.rootHash).toBe('a'.repeat(64));
  });

  it('verify() 最新记录匹配 → true', async () => {
    const { LocalFileHashStore } = await import('../../src/security/external-hash-store');
    const store = new LocalFileHashStore(testDir);

    await store.publish('org-1', 'aaa', '2026-07-17T00:00:00.000Z', 'sig1');
    await store.publish('org-1', 'bbb', '2026-07-17T01:00:00.000Z', 'sig2');

    const ok = await store.verify('org-1', 'bbb');
    expect(ok).toBe(true);
  });

  it('verify() 不匹配 → false', async () => {
    const { LocalFileHashStore } = await import('../../src/security/external-hash-store');
    const store = new LocalFileHashStore(testDir);

    await store.publish('org-1', 'aaa', '2026-07-17T00:00:00.000Z', 'sig1');

    const ok = await store.verify('org-1', 'not-the-hash');
    expect(ok).toBe(false);
  });

  it('verify() 无记录 → false', async () => {
    const { LocalFileHashStore } = await import('../../src/security/external-hash-store');
    const store = new LocalFileHashStore(testDir);

    const ok = await store.verify('no-such-org', 'aaa');
    expect(ok).toBe(false);
  });
});

// ============================================================
// RootHashPublisher
// ============================================================

describe('RootHashPublisher', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = tmpDir();
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('publishForOrg() 发布成功 → 外部存储含记录', async () => {
    const { AuditStore } = await import('../../src/l4/audit-store');
    const { LocalFileHashStore } = await import('../../src/security/external-hash-store');
    const { RootHashPublisher } = await import('../../src/security/root-hash-publisher');

    const db = createTestDb();
    const store = new AuditStore(db);
    const extStore = new LocalFileHashStore(testDir);
    const publisher = new RootHashPublisher(store, extStore, 99999999, 'test-secret', ['org-1']);

    // 写入两条审计记录
    store.log({ orgId: 'org-1', actorId: 'u1', actorRole: 'admin', action: 'entry.1' });
    store.log({ orgId: 'org-1', actorId: 'u1', actorRole: 'admin', action: 'entry.2' });

    const record = await publisher.publishForOrg('org-1');
    expect(record.stored).toBe(true);
    expect(record.rootHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.orgId).toBe('org-1');
    expect(record.signature).toBeTruthy();

    // 验证外部存储
    const verifyOk = await extStore.verify('org-1', record.rootHash);
    expect(verifyOk).toBe(true);
  });

  it('publishForOrg() 无审计记录 → stored=false', async () => {
    const { AuditStore } = await import('../../src/l4/audit-store');
    const { LocalFileHashStore } = await import('../../src/security/external-hash-store');
    const { RootHashPublisher } = await import('../../src/security/root-hash-publisher');

    const db = createTestDb();
    const store = new AuditStore(db);
    const extStore = new LocalFileHashStore(testDir);
    const publisher = new RootHashPublisher(store, extStore, 99999999, 'test-secret', ['org-1']);

    const record = await publisher.publishForOrg('org-1');
    expect(record.stored).toBe(false);
    expect(record.rootHash).toBe('');
  });

  it('start()/stop() 控制生命周期', async () => {
    const { AuditStore } = await import('../../src/l4/audit-store');
    const { LocalFileHashStore } = await import('../../src/security/external-hash-store');
    const { RootHashPublisher } = await import('../../src/security/root-hash-publisher');

    const db = createTestDb();
    const store = new AuditStore(db);
    const extStore = new LocalFileHashStore(testDir);
    const publisher = new RootHashPublisher(store, extStore, 99999999, 'test-secret', ['org-1']);

    expect(publisher.isRunning).toBe(false);
    publisher.start();
    expect(publisher.isRunning).toBe(true);
    publisher.stop();
    expect(publisher.isRunning).toBe(false);
  });

  it('publishForAllOrgs() 空组织列表 → 空结果', async () => {
    const { AuditStore } = await import('../../src/l4/audit-store');
    const { LocalFileHashStore } = await import('../../src/security/external-hash-store');
    const { RootHashPublisher } = await import('../../src/security/root-hash-publisher');

    const db = createTestDb();
    const store = new AuditStore(db);
    const extStore = new LocalFileHashStore(testDir);
    const publisher = new RootHashPublisher(store, extStore, 99999999, 'test-secret', []);

    const records = await publisher.publishForAllOrgs();
    expect(records).toEqual([]);
  });
});
