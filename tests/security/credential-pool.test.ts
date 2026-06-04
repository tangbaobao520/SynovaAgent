/**
 * tests/security/credential-pool.test.ts — CredentialPool 多凭据轮换
 *
 * 铁律 0-2: 每个 public 函数 ≥ 2 用例 (happy + sad)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CredentialPool } from '../../src/security/credential-vault';

describe('CredentialPool — round-robin acquisition', () => {
  let pool: CredentialPool;
  beforeEach(() => { pool = new CredentialPool(); });

  it('Given registered credential, When acquire, Then returns it', () => {
    pool.register('feishu-1', { appId: 'a', appSecret: 's' });
    const cred = pool.acquire();
    expect(cred).not.toBeNull();
    expect(cred!.connectorId).toBe('feishu-1');
    expect(cred!.credentials.appId).toBe('a');
  });

  it('Given empty pool, When acquire, Then returns null', () => {
    const cred = pool.acquire();
    expect(cred).toBeNull();
  });

  it('Given 2 credentials, When acquire twice, Then round-robin distributes', () => {
    pool.register('a', { key: '1' });
    pool.register('b', { key: '2' });
    const c1 = pool.acquire()!;
    const c2 = pool.acquire()!;
    expect(c1.connectorId).toBe('a'); // least used first
    expect(c2.connectorId).toBe('b');
  });

  it('Given multi-acquire, When same cred used more, Then other preferred', () => {
    pool.register('a', { key: '1' });
    pool.register('b', { key: '2' });
    pool.acquire(); pool.acquire(); pool.acquire(); // a:1, b:2, a:3
    const c = pool.acquire()!; // should be b (used 2 vs a's 3)
    expect(c.connectorId).toBe('b');
  });
});

describe('CredentialPool — status management', () => {
  let pool: CredentialPool;
  beforeEach(() => { pool = new CredentialPool(); });

  it('Given marked exhausted, When acquire, Then skipped', () => {
    pool.register('a', { key: '1' });
    pool.register('b', { key: '2' });
    pool.markError('a', 'rate limited');
    // Both times should return b since a is exhausted
    const c1 = pool.acquire()!;
    const c2 = pool.acquire()!;
    expect(c1.connectorId).toBe('b');
    expect(c2.connectorId).toBe('b');
  });

  it('Given marked dead, When acquire, Then permanently skipped', () => {
    pool.register('a', { key: '1' });
    pool.markDead('a');
    const cred = pool.acquire();
    expect(cred).toBeNull(); // only a which is dead
  });

  it('Given both dead, When acquire, Then null', () => {
    pool.register('a', { key: '1' });
    pool.register('b', { key: '2' });
    pool.markDead('a');
    pool.markDead('b');
    expect(pool.acquire()).toBeNull();
  });

  it('Given listStatus, When called, Then returns all entries with status', () => {
    pool.register('a', { key: '1' });
    pool.markError('a', 'err');
    pool.register('b', { key: '2' });
    const status = pool.listStatus();
    expect(status).toHaveLength(2);
    expect(status.find(s => s.id === 'a')!.status).toBe('exhausted');
    expect(status.find(s => s.id === 'b')!.status).toBe('ok');
  });
});
