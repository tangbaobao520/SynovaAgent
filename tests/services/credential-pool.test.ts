/**
 * tests/services/credential-pool.test.ts — Phase 5.5 凭据池轮换测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@synova/logger', () => {
  const m = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
  return { logger: m, createLogger: vi.fn(() => m) };
});

import { CredentialPool } from '../../src/providers/registry';
import { logger } from '@synova/logger';

describe('CredentialPool', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('register 后 count 应正确', () => {
    const pool = new CredentialPool();
    pool.register('key-1', { apiKey: 'sk-xxx' });
    pool.register('key-2', { apiKey: 'sk-yyy' });
    expect(pool.count()).toBe(2);
  });

  it('get 应返回第一个可用凭据', () => {
    const pool = new CredentialPool();
    pool.register('key-1', { apiKey: 'sk-xxx' });
    const cred = pool.get();
    expect(cred?.id).toBe('key-1');
    expect(cred?.credentials.apiKey).toBe('sk-xxx');
  });

  it('一个凭据耗尽应自动切换到下一个', () => {
    const pool = new CredentialPool();
    pool.register('key-1', { apiKey: 'sk-xxx' });
    pool.register('key-2', { apiKey: 'sk-yyy' });

    pool.markExhausted('key-1');
    const cred = pool.get();

    expect(cred?.id).toBe('key-2');
  });

  it('所有凭据耗尽应返回 null', () => {
    const pool = new CredentialPool();
    pool.register('key-1', { apiKey: 'sk-xxx' });

    pool.markExhausted('key-1');
    const cred = pool.get();

    expect(cred).toBeNull();
  });

  it('标记耗尽应记录日志', () => {
    const pool = new CredentialPool();
    pool.register('key-1', { apiKey: 'sk-xxx' });

    pool.markExhausted('key-1');

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'key-1' }),
      expect.stringContaining('耗尽'),
    );
  });

  it('冷却期满后凭据应自动恢复', async () => {
    const pool = new CredentialPool({ cooldownMs: 50 });
    pool.register('key-1', { apiKey: 'sk-xxx' });

    pool.markExhausted('key-1');
    expect(pool.get()).toBeNull();

    await new Promise(r => setTimeout(r, 60));
    const cred = pool.get();
    expect(cred?.id).toBe('key-1');
  });
});
