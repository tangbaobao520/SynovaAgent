/**
 * tests/deploy/backup-verify.test.ts — D50 备份验证测试
 */
import { describe, it, expect } from 'vitest';
import { verifyLocalBackup } from '../../src/deploy/backup-verify';

describe('D50: backup-verify', () => {
  it('verifyLocalBackup 对不存在包返回错误', async () => {
    const result = await verifyLocalBackup('/nonexistent/pack.synova-recovery', 'test');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('probeRemotePack 对不可达 URL 返回 reachable:false', async () => {
    const { probeRemotePack } = await import('../../src/deploy/backup-verify');
    const result = await probeRemotePack('http://localhost:1/nonexistent', '');
    expect(result.reachable).toBe(false);
  });
});
