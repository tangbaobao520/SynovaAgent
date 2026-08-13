/**
 * tests/deploy/recovery-pack.test.ts — D50 恢复包测试
 *
 * 覆盖: 打包/验证/恢复/解密失败/空密码/损坏包/清理
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('D50: recovery-pack — 打包/验证/恢复', () => {
  const TEST_DATA_DIR = path.join(process.cwd(), 'tmp', 'd50-test-data');
  const PASSWORD = 'test-recovery-password-123';

  beforeEach(() => {
    // 创建测试数据目录
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(TEST_DATA_DIR, 'synova.db'), 'fake-sqlite-content');
    fs.writeFileSync(path.join(TEST_DATA_DIR, 'version.txt'), '1.0.0');
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  it('createRecoveryPack 创建 .synova-recovery 包', async () => {
    const { RecoveryPackBuilder } = await import('../../src/deploy/recovery-pack');
    const builder = new RecoveryPackBuilder();
    // 覆盖数据目录为测试目录
    (builder as unknown as Record<string, string>).dataDir = TEST_DATA_DIR;

    const result = builder.createRecoveryPack(PASSWORD);
    expect(result.created).toBe(true);
    expect(result.path).toMatch(/\.synova-recovery$/);
    expect(result.size).toBeGreaterThan(0);
    expect(result.meta.fileCount).toBeGreaterThan(0);
    expect(result.meta.algorithm).toBe('aes-256-cbc');
    expect(fs.existsSync(result.path)).toBe(true);
  });

  it('verifyRecoveryPack 验证成功', async () => {
    const { RecoveryPackBuilder } = await import('../../src/deploy/recovery-pack');
    const builder = new RecoveryPackBuilder();
    (builder as unknown as Record<string, string>).dataDir = TEST_DATA_DIR;

    const { path: packPath } = builder.createRecoveryPack(PASSWORD);
    const verify = builder.verifyRecoveryPack(packPath, PASSWORD);
    expect(verify.valid).toBe(true);
    expect(verify.checksumMatch).toBe(true);
    expect(verify.meta).toBeTruthy();
    expect(verify.meta!.fileCount).toBeGreaterThan(0);
  });

  it('restoreFromPack 恢复文件', async () => {
    const { RecoveryPackBuilder } = await import('../../src/deploy/recovery-pack');
    const builder = new RecoveryPackBuilder();
    (builder as unknown as Record<string, string>).dataDir = TEST_DATA_DIR;

    const { path: packPath } = builder.createRecoveryPack(PASSWORD);
    const restoreDir = path.join(TEST_DATA_DIR, 'restored');
    const result = builder.restoreFromPack(packPath, PASSWORD, restoreDir);
    expect(result.success).toBe(true);
    expect(result.restoredFiles.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(restoreDir, 'synova.db'))).toBe(true);
    expect(fs.readFileSync(path.join(restoreDir, 'synova.db'), 'utf-8')).toBe('fake-sqlite-content');
  });

  it('错误密码解密失败', async () => {
    const { RecoveryPackBuilder } = await import('../../src/deploy/recovery-pack');
    const builder = new RecoveryPackBuilder();
    (builder as unknown as Record<string, string>).dataDir = TEST_DATA_DIR;

    const { path: packPath } = builder.createRecoveryPack(PASSWORD);
    const verify = builder.verifyRecoveryPack(packPath, 'wrong-password');
    expect(verify.valid).toBe(false);
    expect(verify.errors.some(e => e.includes('密码'))).toBe(true);
  });

  it('短密码被拒绝', async () => {
    const { RecoveryPackBuilder } = await import('../../src/deploy/recovery-pack');
    const builder = new RecoveryPackBuilder();
    (builder as unknown as Record<string, string>).dataDir = TEST_DATA_DIR;

    const result = builder.createRecoveryPack('ab');
    expect(result.created).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('损坏包验证失败', async () => {
    const { RecoveryPackBuilder } = await import('../../src/deploy/recovery-pack');
    const builder = new RecoveryPackBuilder();

    const fakePath = path.join(TEST_DATA_DIR, 'fake.synova-recovery');
    fs.writeFileSync(fakePath, 'not-a-real-recovery-pack');
    const verify = builder.verifyRecoveryPack(fakePath, PASSWORD);
    expect(verify.valid).toBe(false);
    expect(verify.errors.length).toBeGreaterThan(0);
  });

  it('listRecoveryPacks 列出所有包', async () => {
    const { RecoveryPackBuilder } = await import('../../src/deploy/recovery-pack');
    const builder = new RecoveryPackBuilder();
    (builder as unknown as Record<string, string>).dataDir = TEST_DATA_DIR;

    builder.createRecoveryPack(PASSWORD);
    builder.createRecoveryPack(PASSWORD);

    const packs = builder.listRecoveryPacks();
    expect(packs.length).toBe(2);
  });
});
