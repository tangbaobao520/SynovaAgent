/**
 * tests/contract/contract-store.test.ts — D215 ContractStore 测试
 *
 * 覆盖: save/load/archive/list = 4 tests
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { ContractStore } from '../../src/contract/contract-store';
import type { ContractRecord } from '../../src/contract/contract-store';

const TEST_DIR = join(process.cwd(), '.codex', 'contracts-test');

describe('ContractStore', () => {
  let store: ContractStore;

  beforeEach(() => { store = new ContractStore(TEST_DIR); });
  afterEach(() => { try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch { /* ok */ } });

  const SAMPLE: ContractRecord[] = [{
    contractId: 'ct-1', type: 'export_function', name: 'computeOverflow',
    signature: 'export function computeOverflow()', confidence: 0.9,
    sourceLine: 42, extractedAt: new Date().toISOString(),
  }];

  it('save → 文件写入指定路径', () => {
    const path = store.save(SAMPLE, 'D215');
    expect(path).toContain('CONTRACT-D215-');
    expect(existsSync(path)).toBe(true);
  });

  it('load → 返回已保存的契约', () => {
    store.save(SAMPLE, 'D215');
    const loaded = store.load('D215');
    expect(loaded.length).toBe(1);
    expect(loaded[0].contractId).toBe('ct-1');
  });

  it('archive → 移动到 archive/', () => {
    store.save(SAMPLE, 'D215');
    store.archive('ct-1');
    const archived = store.load('D215');
    expect(archived.length).toBe(0);
  });

  it('list → 返回未归档文件名', () => {
    store.save(SAMPLE, 'D215');
    const files = store.list();
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files[0]).toContain('CONTRACT-D215-');
  });
});
