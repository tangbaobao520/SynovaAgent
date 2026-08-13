/**
 * tests/contract/contract-gate.test.ts — D215 ContractGate 测试
 *
 * 覆盖: validateAll/validateOne/degraded = 3 tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ContractStore } from '../../src/contract/contract-store';
import { ContractGate } from '../../src/contract/contract-gate';
import type { ContractRecord } from '../../src/contract/contract-store';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(process.cwd(), '.codex', 'contracts-gate-test');

describe('ContractGate', () => {
  let store: ContractStore;
  let gate: ContractGate;

  beforeEach(() => {
    store = new ContractStore(TEST_DIR);
    gate = new ContractGate(store, process.cwd());
  });

  afterEach(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch { /* ok */ }
  });

  it('validateAll — 无契约 → pass', async () => {
    const report = await gate.validateAll();
    expect(report.pass).toBe(true);
    expect(report.failures).toEqual([]);
  });

  it('validateOne — file_path 存在 → pass', async () => {
    const contract: ContractRecord = {
      contractId: 'ct-file', type: 'file_path', name: 'src/contract/contract-store.ts',
      signature: '', confidence: 1, sourceLine: 1, extractedAt: new Date().toISOString(),
      filePath: 'src/contract/contract-store.ts',
    };
    const result = await gate.validateOne(contract);
    expect(result.pass).toBe(true);
    expect(result.detail).toContain('存在');
  });

  it('validateOne — file_path 不存在 → fail', async () => {
    const contract: ContractRecord = {
      contractId: 'ct-nonexist', type: 'file_path', name: 'src/nonexistent/file.ts',
      signature: '', confidence: 1, sourceLine: 1, extractedAt: new Date().toISOString(),
      filePath: 'src/nonexistent/file.ts',
    };
    const result = await gate.validateOne(contract);
    expect(result.pass).toBe(false);
  });

  it('integration: 保存+验证 完整链路', async () => {
    store.save([{
      contractId: 'ct-src', type: 'file_path', name: 'src/contract/contract-store.ts',
      signature: '', confidence: 1, sourceLine: 1, extractedAt: new Date().toISOString(),
      filePath: 'src/contract/contract-store.ts',
    }], 'D215');

    const report = await gate.validateAll();
    expect(report.pass).toBe(true);
    expect(report.degraded).toBe(false);
  });
});
