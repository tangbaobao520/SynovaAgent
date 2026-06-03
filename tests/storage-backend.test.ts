/**
 * storage-backend.test.ts — StorageBackend 测试
 *
 * 对标 Claw-Code: Given/When/Then + 手写 test data
 * 铁律 0-2: 每个 public 函数 >= 2 用例 (happy + sad)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageBackend } from '../src/store/storage-backend';
import type { StorageBackend } from '../src/store/storage-backend';

describe('MemoryStorageBackend', () => {
  let backend: StorageBackend;

  beforeEach(() => {
    backend = new MemoryStorageBackend();
  });

  // ── set + get ──

  it('Given a key-value pair set, When get by key, Then value is retrieved', async () => {
    // Given: a key-value pair
    await backend.set('config', '{"port":3000}');

    // When: getting the value
    const result = await backend.get('config');

    // Then: the value matches
    expect(result.value).toBe('{"port":3000}');
    expect(result.degraded).toBe(false);
  });

  it('Given a non-existent key, When get, Then returns null (not degraded)', async () => {
    // Given: no value set for this key (sad path)
    // When: getting a non-existent key
    const result = await backend.get('nonexistent');

    // Then: value is null, not degraded
    expect(result.value).toBeNull();
    expect(result.degraded).toBe(false);
  });

  // ── set + delete ──

  it('Given a key set, When deleted, Then get returns null', async () => {
    // Given: a key with a value
    await backend.set('temp', 'data');

    // When: deleting it
    const deleteResult = await backend.delete('temp');

    // Then: delete reports true, get returns null
    expect(deleteResult.value).toBe(true);
    const getResult = await backend.get('temp');
    expect(getResult.value).toBeNull();
  });

  it('Given a non-existent key, When deleted, Then returns false', async () => {
    // Given: no such key (sad path)
    // When: deleting
    const result = await backend.delete('nothing');

    // Then: returns false
    expect(result.value).toBe(false);
  });

  // ── namespace isolation ──

  it('Given keys in different namespaces, When query by namespace, Then only matching keys returned', async () => {
    // Given: keys in two different namespaces
    await backend.set('key1', 'v1', 'ns-a');
    await backend.set('key2', 'v2', 'ns-a');
    await backend.set('key3', 'v3', 'ns-b');

    // When: querying namespace ns-a
    const result = await backend.query({ namespace: 'ns-a' });

    // Then: only ns-a entries are returned
    expect(result.value).toHaveLength(2);
    expect(result.value.every(e => e.namespace === 'ns-a')).toBe(true);
  });

  it('Given no entries, When query, Then returns empty array', async () => {
    // Given: empty store (sad path)
    // When: querying
    const result = await backend.query({});

    // Then: empty array
    expect(result.value).toHaveLength(0);
  });

  // ── query with limit ──

  it('Given 5 entries, When query with limit 3, Then returns only 3', async () => {
    // Given: 5 entries
    for (let i = 0; i < 5; i++) {
      await backend.set(`key${i}`, `val${i}`);
    }

    // When: querying with limit
    const result = await backend.query({ limit: 3 });

    // Then: only 3 entries returned
    expect(result.value).toHaveLength(3);
  });

  // ── health check ──

  it('Given MemoryStorageBackend, When healthCheck, Then returns healthy', async () => {
    // Given: memory backend
    // When: health check
    const health = await backend.healthCheck();

    // Then: healthy
    expect(health.healthy).toBe(true);
  });
});
