/**
 * tests/monitoring/system-health.test.ts — D49 系统健康审计测试
 *
 * 覆盖: 7项指标 + 备份null + 哨兵计数 + 版本号 + 边界
 */
import { describe, it, expect } from 'vitest';
import { SystemHealthAudit } from '../../src/monitoring/system-health';
import type { SystemHealthReport } from '../../src/monitoring/system-health';

describe('D49: system-health — SystemHealthAudit', () => {
  it('audit() 返回 SystemHealthReport 结构', async () => {
    const auditor = new SystemHealthAudit();
    const report = await auditor.audit();
    expect(report).toHaveProperty('uptime30d');
    expect(report).toHaveProperty('lastBackup');
    expect(report).toHaveProperty('dataDelayCount');
    expect(report).toHaveProperty('activeSentinels');
    expect(report).toHaveProperty('watchdogRestartCount');
    expect(report).toHaveProperty('agentVersion');
    expect(report).toHaveProperty('totalDiagnosisCount');
    expect(report).toHaveProperty('collectedAt');
    expect(typeof report.collectedAt).toBe('string');
    expect(() => new Date(report.collectedAt)).not.toThrow();
  });

  it('lastBackup 当前返回 null (待 D50)', async () => {
    const auditor = new SystemHealthAudit();
    const report = await auditor.audit();
    expect(report.lastBackup).toBeNull();
  });

  it('activeSentinels 有 total 和 active 字段', async () => {
    const auditor = new SystemHealthAudit();
    const report = await auditor.audit();
    expect(report.activeSentinels).toHaveProperty('total');
    expect(report.activeSentinels).toHaveProperty('active');
    expect(typeof report.activeSentinels.total).toBe('number');
    expect(typeof report.activeSentinels.active).toBe('number');
    expect(report.activeSentinels.active).toBeLessThanOrEqual(report.activeSentinels.total);
  });

  it('agentVersion 返回非空字符串', async () => {
    const auditor = new SystemHealthAudit();
    const report = await auditor.audit();
    expect(typeof report.agentVersion).toBe('string');
    expect(report.agentVersion.length).toBeGreaterThan(0);
    // 应为 semver 格式
    expect(report.agentVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('watchdogRestartCount 返回数字', async () => {
    const auditor = new SystemHealthAudit();
    const report = await auditor.audit();
    expect(typeof report.watchdogRestartCount).toBe('number');
    expect(report.watchdogRestartCount).toBeGreaterThanOrEqual(0);
  });

  it('totalDiagnosisCount 返回数字', async () => {
    const auditor = new SystemHealthAudit();
    const report = await auditor.audit();
    expect(typeof report.totalDiagnosisCount).toBe('number');
    expect(report.totalDiagnosisCount).toBeGreaterThanOrEqual(0);
  });

  it('dataDelayCount 返回数字', async () => {
    const auditor = new SystemHealthAudit();
    const report = await auditor.audit();
    expect(typeof report.dataDelayCount).toBe('number');
    expect(report.dataDelayCount).toBeGreaterThanOrEqual(0);
  });

  it('并发多次 audit() 不相互干扰', async () => {
    const auditor = new SystemHealthAudit();
    const [r1, r2] = await Promise.all([auditor.audit(), auditor.audit()]);
    expect(r1.collectedAt).toBeTruthy();
    expect(r2.collectedAt).toBeTruthy();
    expect(r1.agentVersion).toBe(r2.agentVersion);
  });
});
