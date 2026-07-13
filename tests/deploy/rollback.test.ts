/**
 * tests/deploy/rollback.test.ts — D48 快照回滚测试
 *
 * 覆盖:
 *   - createSnapshot: 创建快照成功
 *   - createSnapshot: 重复创建不覆盖
 *   - listSnapshots: 列出可用快照
 *   - rollbackToSnapshot: 快照不存在 → 降级 (available:false)
 *   - rollbackToSnapshot: 路径不存在 → 降级
 *   - rollbackToSnapshot: 从快照恢复
 *   - 回滚后数据完整 (创建快照→修改→回滚→验证)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const TEST_SNAPSHOTS_DIR = path.join(process.cwd(), 'tmp', 'd48-test-snapshots');

describe('D48: rollback — 快照管理', () => {
  const ORIG_PLATFORM = process.platform;
  const ORIG_HOME = process.env.HOME;

  beforeEach(() => {
    // 清理测试目录
    if (fs.existsSync(TEST_SNAPSHOTS_DIR)) {
      fs.rmSync(TEST_SNAPSHOTS_DIR, { recursive: true, force: true });
    }
    // 设置 platform 为 linux 以使用可预测路径
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    process.env.HOME = TEST_SNAPSHOTS_DIR;
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: ORIG_PLATFORM, configurable: true });
    process.env.HOME = ORIG_HOME;
    if (fs.existsSync(TEST_SNAPSHOTS_DIR)) {
      fs.rmSync(TEST_SNAPSHOTS_DIR, { recursive: true, force: true });
    }
  });

  it('createSnapshot 创建快照成功', async () => {
    // 先创建数据目录
    const { registerDataDirectory } = await import('../../src/deploy/data-directory');
    registerDataDirectory();

    const { createSnapshot } = await import('../../src/deploy/rollback');
    const result = createSnapshot('test-snapshot-1');
    expect(result.created).toBe(true);
    expect(result.path).toBeTruthy();
    expect(fs.existsSync(result.path)).toBe(true);
    // 应有 .snapshot-meta.json
    expect(fs.existsSync(path.join(result.path, '.snapshot-meta.json'))).toBe(true);
  });

  it('重复创建不覆盖 (created:false)', async () => {
    const { registerDataDirectory } = await import('../../src/deploy/data-directory');
    registerDataDirectory();

    const { createSnapshot } = await import('../../src/deploy/rollback');
    const r1 = createSnapshot('test-snapshot-2');
    expect(r1.created).toBe(true);

    const r2 = createSnapshot('test-snapshot-2');
    expect(r2.created).toBe(false);
  });

  it('listSnapshots 列出可用快照', async () => {
    const { registerDataDirectory } = await import('../../src/deploy/data-directory');
    registerDataDirectory();

    const { createSnapshot, listSnapshots } = await import('../../src/deploy/rollback');
    createSnapshot('snap-a');
    createSnapshot('snap-b');

    const snaps = listSnapshots();
    expect(snaps.length).toBe(2);
  });

  it('快照不存在 → rollback 降级 (available:false)', async () => {
    const { rollbackToSnapshot } = await import('../../src/deploy/rollback');
    const result = rollbackToSnapshot('/nonexistent/snapshot');
    expect(result.available).toBe(false);
    expect(result.success).toBe(false);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('无可用快照 → rollback 降级 (available:false)', async () => {
    const { rollbackToSnapshot } = await import('../../src/deploy/rollback');
    const result = rollbackToSnapshot();
    expect(result.available).toBe(false);
    expect(result.success).toBe(false);
  });

  it('创建快照 → 修改 → 回滚 → 数据完整', async () => {
    const { registerDataDirectory } = await import('../../src/deploy/data-directory');
    const dataDir = registerDataDirectory().path;

    // 写入初始数据
    fs.writeFileSync(path.join(dataDir, 'important.db'), 'version1-data', 'utf-8');

    // 创建快照
    const { createSnapshot, rollbackToSnapshot, listSnapshots } = await import('../../src/deploy/rollback');
    const snap = createSnapshot('test-rollback-cycle');
    expect(snap.created).toBe(true);

    // 修改数据 (模拟升级)
    fs.writeFileSync(path.join(dataDir, 'important.db'), 'version2-data', 'utf-8');
    expect(fs.readFileSync(path.join(dataDir, 'important.db'), 'utf-8')).toBe('version2-data');

    // 回滚
    const snaps = listSnapshots();
    const rollResult = rollbackToSnapshot(snaps[snaps.length - 1]);
    expect(rollResult.success).toBe(true);
    expect(rollResult.available).toBe(true);
    expect(rollResult.warnings).toEqual([]);

    // 验证数据已恢复
    expect(fs.readFileSync(path.join(dataDir, 'important.db'), 'utf-8')).toBe('version1-data');
  });
});
