/**
 * tests/services/behavior-monitor.test.ts — GA 行为监控单元测试 (Phase 0.4)
 *
 * test-first: 先写测试，再实现。
 * 验证 4 条规则 + evaluate 统一入口。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AuditStore, type AuditEntryInput } from '../../src/l4/audit-store';

// 加载模块（延迟 import 以便在 test 内动态加载）
let BehaviorMonitor: any;

async function loadModules() {
  const mod = await import('../../src/services/behavior-monitor');
  BehaviorMonitor = mod.BehaviorMonitor;
}

function createTestDb() {
  const BetterSqlite3 = require('better-sqlite3');
  const db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = WAL');
  return db;
}

/** 往 AuditStore 中批量写入日志 */
function seedAuditLogs(store: AuditStore, entries: AuditEntryInput[]): void {
  for (const e of entries) {
    store.log(e);
  }
}

/** 创建一个距离现在 offsetMs 毫秒的 ISO 时间戳 */
function timeAgo(offsetMs: number): string {
  return new Date(Date.now() - offsetMs).toISOString();
}

// ============================================================
// Rule 1: 批量数据修改检测
// ============================================================

describe('BehaviorMonitor.checkBulkModification', () => {
  beforeEach(async () => {
    await loadModules();
  });

  it('5 分钟内 10 次以下操作 → 不告警', async () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    // 5 次操作（低于阈值 10）
    for (let i = 0; i < 5; i++) {
      store.log({
        orgId: 'org-1', actorId: 'ga_001', actorRole: 'ga',
        action: 'node.create', targetType: 'Person',
      });
    }

    const alerts = await BehaviorMonitor.checkBulkModification('org-1', 'ga_001', store);
    expect(alerts).toEqual([]);
  });

  it('5 分钟内 11 次以上操作 → 告警', async () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    for (let i = 0; i < 12; i++) {
      store.log({
        orgId: 'org-1', actorId: 'ga_001', actorRole: 'ga',
        action: 'node.create', targetType: 'Person',
      });
    }

    const alerts = await BehaviorMonitor.checkBulkModification('org-1', 'ga_001', store);
    expect(alerts.length).toBe(1);
    expect(alerts[0].ruleId).toBe('bulk_modification');
    expect(alerts[0].severity).toBe('warning');
    expect(alerts[0].actorId).toBe('ga_001');
  });

  it('不同 actor 的操作不互相影响', async () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    for (let i = 0; i < 15; i++) {
      store.log({
        orgId: 'org-1', actorId: 'ga_001', actorRole: 'ga',
        action: 'node.create',
      });
    }
    for (let i = 0; i < 3; i++) {
      store.log({
        orgId: 'org-1', actorId: 'ga_002', actorRole: 'ga',
        action: 'node.create',
      });
    }

    const alerts1 = await BehaviorMonitor.checkBulkModification('org-1', 'ga_001', store);
    const alerts2 = await BehaviorMonitor.checkBulkModification('org-1', 'ga_002', store);
    expect(alerts1.length).toBe(1);  // ga_001 触发
    expect(alerts2.length).toBe(0);  // ga_002 不触发
  });
});

// ============================================================
// Rule 2: 异常时段操作检测
// ============================================================

describe('BehaviorMonitor.checkOffHoursActivity', () => {
  beforeEach(async () => {
    await loadModules();
  });

  it('工作时间操作 → 不告警', async () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    // 用工作时段的时间戳（上午 10:00）写入
    const workHourDate = new Date();
    workHourDate.setHours(10, 0, 0, 0);
    db.prepare(`
      INSERT INTO audit_log (id, org_id, actor_id, actor_role, action, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('work_1', 'org-1', 'ga_001', 'ga', 'node.create', workHourDate.toISOString());

    const alerts = await BehaviorMonitor.checkOffHoursActivity('org-1', 'ga_001', store);
    expect(alerts).toEqual([]);
  });

  it('非工作时间操作 → 告警', async () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    // 模拟非工作时间（凌晨 3 点）
    const offHourDate = new Date();
    offHourDate.setHours(3, 0, 0, 0);
    const offHourStr = offHourDate.toISOString();

    // 直接写入数据库（绕过 store.log 以控制时间戳）
    db.prepare(`
      INSERT INTO audit_log (id, org_id, actor_id, actor_role, action, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('off_1', 'org-1', 'ga_001', 'ga', 'threshold.update', offHourStr);

    const alerts = await BehaviorMonitor.checkOffHoursActivity('org-1', 'ga_001', store);
    expect(alerts.length).toBe(1);
    expect(alerts[0].ruleId).toBe('off_hours_activity');
    expect(alerts[0].severity).toBe('warning');
  });

  it('工作日 22:00 后操作 → 告警', async () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    const lateDate = new Date();
    lateDate.setHours(23, 30, 0, 0);
    const lateStr = lateDate.toISOString();

    db.prepare(`
      INSERT INTO audit_log (id, org_id, actor_id, actor_role, action, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('late_1', 'org-1', 'ga_001', 'ga', 'node.delete', lateStr);

    const alerts = await BehaviorMonitor.checkOffHoursActivity('org-1', 'ga_001', store);
    expect(alerts.length).toBe(1);
  });
});

// ============================================================
// Rule 3: 快速连续纠错检测
// ============================================================

describe('BehaviorMonitor.checkRapidCorrections', () => {
  beforeEach(async () => {
    await loadModules();
  });

  it('30 分钟内少于 5 次纠错 → 不告警', async () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    for (let i = 0; i < 3; i++) {
      store.log({
        orgId: 'org-1', actorId: 'ga_001', actorRole: 'ga',
        action: 'ga.correction',
      });
    }

    const alerts = await BehaviorMonitor.checkRapidCorrections('org-1', 'ga_001', store);
    expect(alerts).toEqual([]);
  });

  it('30 分钟内 5 次以上纠错 → 告警', async () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    for (let i = 0; i < 6; i++) {
      store.log({
        orgId: 'org-1', actorId: 'ga_001', actorRole: 'ga',
        action: 'ga.correction',
      });
    }

    const alerts = await BehaviorMonitor.checkRapidCorrections('org-1', 'ga_001', store);
    expect(alerts.length).toBe(1);
    expect(alerts[0].ruleId).toBe('rapid_corrections');
    expect(alerts[0].severity).toBe('warning');
    expect(alerts[0].metadata.count).toBeGreaterThanOrEqual(5);
  });

  it('非纠错操作不计数', async () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    for (let i = 0; i < 8; i++) {
      store.log({
        orgId: 'org-1', actorId: 'ga_001', actorRole: 'ga',
        action: i < 6 ? 'ga.correction' : 'node.create',
      });
    }

    const alerts = await BehaviorMonitor.checkRapidCorrections('org-1', 'ga_001', store);
    expect(alerts.length).toBe(1);
    expect(alerts[0].metadata.count).toBe(6); // 只计 correction
  });
});

// ============================================================
// Rule 4: 系统性下调阈值检测
// ============================================================

describe('BehaviorMonitor.checkThresholdManipulation', () => {
  beforeEach(async () => {
    await loadModules();
  });

  it('24 小时内下调少于 4 个阈值 → 不告警', async () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    for (let i = 0; i < 2; i++) {
      store.log({
        orgId: 'org-1', actorId: 'ga_001', actorRole: 'ga',
        action: 'threshold.update',
        targetType: 'threshold',
        oldValue: JSON.stringify({ threshold: 0.5 }),
        newValue: JSON.stringify({ threshold: 0.3 }), // 降幅 40%
      });
    }

    const alerts = await BehaviorMonitor.checkThresholdManipulation('org-1', 'ga_001', store);
    expect(alerts).toEqual([]);
  });

  it('24 小时内下调 4 个阈值 >30% → 告警', async () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    for (let i = 0; i < 4; i++) {
      store.log({
        orgId: 'org-1', actorId: 'ga_001', actorRole: 'ga',
        action: 'threshold.update',
        targetType: 'threshold',
        targetId: `th_${i}`,
        oldValue: JSON.stringify({ threshold: 0.5 }),
        newValue: JSON.stringify({ threshold: 0.3 }), // 降幅 40% > 30%
      });
    }

    const alerts = await BehaviorMonitor.checkThresholdManipulation('org-1', 'ga_001', store);
    expect(alerts.length).toBe(1);
    expect(alerts[0].ruleId).toBe('threshold_manipulation');
    expect(alerts[0].severity).toBe('critical');
    expect(alerts[0].metadata.significantDrops).toBe(4);
  });

  it('阈值上调不触发告警', async () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    for (let i = 0; i < 5; i++) {
      store.log({
        orgId: 'org-1', actorId: 'ga_001', actorRole: 'ga',
        action: 'threshold.update',
        targetType: 'threshold',
        oldValue: JSON.stringify({ threshold: 0.3 }),
        newValue: JSON.stringify({ threshold: 0.5 }), // 上调
      });
    }

    const alerts = await BehaviorMonitor.checkThresholdManipulation('org-1', 'ga_001', store);
    expect(alerts).toEqual([]);
  });

  it('降幅 <30% 不触发告警', async () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    for (let i = 0; i < 5; i++) {
      store.log({
        orgId: 'org-1', actorId: 'ga_001', actorRole: 'ga',
        action: 'threshold.update',
        targetType: 'threshold',
        oldValue: JSON.stringify({ threshold: 0.5 }),
        newValue: JSON.stringify({ threshold: 0.45 }), // 降幅 10% < 30%
      });
    }

    const alerts = await BehaviorMonitor.checkThresholdManipulation('org-1', 'ga_001', store);
    expect(alerts).toEqual([]);
  });
});

// ============================================================
// evaluate — 统一入口
// ============================================================

describe('BehaviorMonitor.evaluate', () => {
  beforeEach(async () => {
    await loadModules();
  });

  it('正常操作不触发任何告警', async () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    store.log({ orgId: 'org-1', actorId: 'admin_01', actorRole: 'admin', action: 'node.create' });

    const alerts = await BehaviorMonitor.evaluate(
      { orgId: 'org-1', actorId: 'admin_01', actorRole: 'admin', action: 'node.create' },
      store,
    );
    expect(alerts).toEqual([]);
  });

  it('可疑操作触发相应告警', async () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    // 批量写入 + 纠错 + 调阈值
    for (let i = 0; i < 12; i++) {
      store.log({ orgId: 'org-1', actorId: 'ga_evil', actorRole: 'ga', action: 'node.create' });
    }
    for (let i = 0; i < 6; i++) {
      store.log({ orgId: 'org-1', actorId: 'ga_evil', actorRole: 'ga', action: 'ga.correction' });
    }
    for (let i = 0; i < 4; i++) {
      store.log({
        orgId: 'org-1', actorId: 'ga_evil', actorRole: 'ga',
        action: 'threshold.update', targetType: 'threshold',
        oldValue: JSON.stringify({ threshold: 0.5 }),
        newValue: JSON.stringify({ threshold: 0.2 }), // 降幅 60%
      });
    }

    const alerts = await BehaviorMonitor.evaluate(
      { orgId: 'org-1', actorId: 'ga_evil', actorRole: 'ga', action: 'threshold.update' },
      store,
    );

    // 应该触发 3 条告警
    expect(alerts.length).toBeGreaterThanOrEqual(3);
    const ruleIds = alerts.map((a: any) => a.ruleId).sort();
    expect(ruleIds).toContain('bulk_modification');
    expect(ruleIds).toContain('rapid_corrections');
    expect(ruleIds).toContain('threshold_manipulation');
  });

  it('evaluate 异常时不抛到外部（降级安全）', async () => {
    const db = createTestDb();
    const store = new AuditStore(db);

    // 传入 null 作为 store → 应降级
    const alerts = await BehaviorMonitor.evaluate(
      { orgId: 'org-1', actorId: 'u1', actorRole: 'admin', action: 'node.create' },
      null,
    );
    expect(alerts).toEqual([]);
  });
});
