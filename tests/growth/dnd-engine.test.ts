/**
 * tests/growth/dnd-engine.test.ts — D74 免打扰规则引擎测试
 */
import { describe, it, expect } from 'vitest';
import type { WorkspaceAlert, DNDConfig } from '../../src/growth/workspace-types';

function makeAlert(overrides: Partial<WorkspaceAlert> = {}): WorkspaceAlert {
  return {
    alertId: 'alert-1',
    severity: 'warning',
    timestamp: new Date().toISOString(),
    message: 'Test alert',
    dismissed: false,
    dndCategory: 'P1',
    ...overrides,
  };
}

describe('shouldDeliver — 免打扰规则', () => {
  it('P0 告警始终推送（不受免打扰限制）', async () => {
    const { shouldDeliver } = await import('../../src/growth/dnd-engine');
    const alert = makeAlert({ dndCategory: 'P0' });
    expect(shouldDeliver(alert)).toBe(true);
  });

  it('P1 告警在间隔期内被抑制', async () => {
    const { shouldDeliver } = await import('../../src/growth/dnd-engine');
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    const alert = makeAlert({
      dndCategory: 'P1',
      lastDeliveredAt: threeDaysAgo,
    });
    // 3天前 (< 7天间隔) 应被抑制
    expect(shouldDeliver(alert)).toBe(false);
  });

  it('P1 告警超过间隔期后放行', async () => {
    const { shouldDeliver } = await import('../../src/growth/dnd-engine');
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();
    const alert = makeAlert({
      dndCategory: 'P1',
      lastDeliveredAt: tenDaysAgo,
    });
    // 10天前 (> 7天间隔) 应放行
    expect(shouldDeliver(alert)).toBe(true);
  });

  it('P2 告警不单独推送', async () => {
    const { shouldDeliver } = await import('../../src/growth/dnd-engine');
    const alert = makeAlert({ dndCategory: 'P2' });
    expect(shouldDeliver(alert)).toBe(false);
  });

  it('免打扰时段内 P1 告警被延迟', async () => {
    const { shouldDeliver } = await import('../../src/growth/dnd-engine');
    // 创建一个当前时间在 08:00 的 now
    const nowMorning = new Date();
    nowMorning.setHours(8, 30, 0, 0);

    const config: DNDConfig = {
      quietHours: [
        { dayOfWeek: nowMorning.getDay(), start: '22:00', end: '09:00' },
      ],
    };

    // 08:30 在跨天免打扰时段 22:00-09:00 内？不应该是...
    // 22:00-09:00 跨天 → 08:30 在这个范围内
    const alert = makeAlert({ dndCategory: 'P1' });
    expect(shouldDeliver(alert, config, nowMorning)).toBe(false);
  });

  it('已消除告警在抑制期内不重复推送', async () => {
    const { shouldDeliver } = await import('../../src/growth/dnd-engine');
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 86400000).toISOString();
    const alert = makeAlert({
      dismissed: true,
      dismissedAt: threeDaysAgo,
      dndCategory: 'P1',
    });
    // 3天前消除 (< 7天抑制) 应抑制
    expect(shouldDeliver(alert)).toBe(false);
  });
});
