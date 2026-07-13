/**
 * tests/deploy/backup-scheduler.test.ts — D50 备份调度器测试
 *
 * 覆盖: 状态/手动触发/错过窗口/连续失败/调度
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('D50: backup-scheduler — 调度器', () => {
  const TEST_HOME = path.join(process.cwd(), 'tmp', 'd50-scheduler-test');
  const ORIG_HOME = process.env.HOME;
  const ORIG_PLATFORM = process.platform;

  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    process.env.HOME = TEST_HOME;
    if (fs.existsSync(TEST_HOME)) {
      fs.rmSync(TEST_HOME, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: ORIG_PLATFORM, configurable: true });
    process.env.HOME = ORIG_HOME;
    if (fs.existsSync(TEST_HOME)) {
      fs.rmSync(TEST_HOME, { recursive: true, force: true });
    }
  });

  it('新调度器状态为初始值', async () => {
    const { BackupScheduler } = await import('../../src/deploy/backup-scheduler');
    const sched = new BackupScheduler();
    const status = sched.getStatus();
    expect(status.lastBackupAt).toBeNull();
    expect(status.consecutiveFailures).toBe(0);
    expect(status.totalBackups).toBe(0);
    expect(status.isRunning).toBe(false);
  });

  it('triggerManual 返回状态', async () => {
    const { BackupScheduler } = await import('../../src/deploy/backup-scheduler');
    const sched = new BackupScheduler();
    const status = sched.triggerManual();
    expect(status).toHaveProperty('lastBackupAt');
    expect(status).toHaveProperty('consecutiveFailures');
    expect(status).toHaveProperty('totalBackups');
  });

  it('getStatus 返回正确形状', async () => {
    const { BackupScheduler } = await import('../../src/deploy/backup-scheduler');
    const sched = new BackupScheduler();
    const status = sched.getStatus();
    expect(status).toHaveProperty('lastBackupAt');
    expect(status).toHaveProperty('lastBackupPath');
    expect(status).toHaveProperty('lastBackupSize');
    expect(status).toHaveProperty('nextScheduledAt');
    expect(status).toHaveProperty('consecutiveFailures');
    expect(status).toHaveProperty('missedWindows');
    expect(status).toHaveProperty('isRunning');
    expect(status).toHaveProperty('totalBackups');
  });

  it('checkMissedWindow 不抛异常', async () => {
    const { BackupScheduler } = await import('../../src/deploy/backup-scheduler');
    const sched = new BackupScheduler();
    expect(() => sched.checkMissedWindow()).not.toThrow();
  });

  it('schedule 不抛异常', async () => {
    const { BackupScheduler } = await import('../../src/deploy/backup-scheduler');
    const sched = new BackupScheduler();
    expect(() => sched.schedule()).not.toThrow();
    sched.stop();
  });
});
