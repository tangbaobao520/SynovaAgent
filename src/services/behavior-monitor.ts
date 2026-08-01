/**
 * services/behavior-monitor.ts — GA 行为监控 (Phase 0.4, Desktop 实施方案)
 *
 * 每次审计日志写入后触发 evaluate()，检测 4 种可疑模式。
 *
 * 设计原则:
 * - 每条规则独立实现，互不影响
 * - evaluate 降级安全（不抛异常到 AuditService）
 * - 查询 AuditStore 做模式匹配，不创建新存储
 *
 * 规则:
 *   1. bulk_modification     — 5 分钟内同 actor >10 次操作
 *   2. off_hours_activity    — 工作时间外（22:00-06:00）操作
 *   3. rapid_corrections     — 30 分钟内 >5 次纠错
 *   4. threshold_manipulation — 24 小时内下调 >4 个阈值 >30%
 */
import { createLogger } from '@synova/logger';
import type { AuditStore, AuditEntryInput } from '../l4/audit-store';

const log = createLogger('services/behavior-monitor');

// ════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════

export interface BehaviorAlert {
  ruleId: string;
  severity: 'warning' | 'critical';
  orgId: string;
  actorId: string;
  title: string;
  description: string;
  triggeredAt: string;
  metadata: Record<string, unknown>;
}

// ════════════════════════════════════════════════════════════════
// BehaviorMonitor
// ════════════════════════════════════════════════════════════════

export class BehaviorMonitor {
  private constructor() {} // 静态类

  // ── 统一入口 ──

  /**
   * 统一入口。每次 AuditService.log() 后异步调用。
   * 运行全部规则，收集所有告警。
   *
   * @param entry - 刚写入的审计日志条目
   * @param store - AuditStore 实例（用于查询历史记录）
   * @returns 本次触发的告警列表
   */
  static async evaluate(
    entry: Pick<AuditEntryInput, 'orgId' | 'actorId' | 'actorRole' | 'action'>,
    store: AuditStore | null,
  ): Promise<BehaviorAlert[]> {
    try {
      if (!store) return [];

      const { orgId, actorId, actorRole } = entry;
      const alerts: BehaviorAlert[] = [];

      // 只有 GA 角色需要监控
      if (actorRole !== 'ga') return [];

      // 并行运行 4 条规则
      const results = await Promise.allSettled([
        this.checkBulkModification(orgId, actorId, store),
        this.checkOffHoursActivity(orgId, actorId, store),
        this.checkRapidCorrections(orgId, actorId, store),
        this.checkThresholdManipulation(orgId, actorId, store),
      ]);

      for (const result of results) {
        if (result.status === 'fulfilled') {
          alerts.push(...result.value);
        } else {
          log.warn({ err: result.reason }, '行为监控规则执行失败 — degraded');
        }
      }

      if (alerts.length > 0) {
        log.warn({
          orgId,
          actorId,
          alertCount: alerts.length,
          rules: alerts.map(a => a.ruleId),
        }, 'GA 行为监控触发告警');
      }

      return alerts;
    } catch (err: unknown) {
      log.warn({ err }, 'BehaviorMonitor.evaluate 异常 — degraded');
      return [];
    }
  }

  // ── Rule 1: 批量数据修改 ──

  /**
   * 规则 1: 检测 5 分钟内同 actor 大量操作。
   * 阈值: >10 次 → 告警
   */
  static async checkBulkModification(
    orgId: string,
    actorId: string,
    store: AuditStore,
  ): Promise<BehaviorAlert[]> {
    try {
      const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const entries = store.rawQuery(
        `SELECT COUNT(*) as cnt FROM audit_log
         WHERE org_id = ? AND actor_id = ? AND created_at >= ?`,
        [orgId, actorId, since],
      );
      const count = (entries as Array<Record<string, unknown>>)?.[0]?.cnt as number || 0;

      if (count > 10) {
        return [{
          ruleId: 'bulk_modification',
          severity: 'warning',
          orgId,
          actorId,
          title: '批量数据修改',
          description: `${actorId} 在 5 分钟内执行了 ${count} 次操作`,
          triggeredAt: new Date().toISOString(),
          metadata: { count, windowMinutes: 5 },
        }];
      }
      return [];
    } catch (err: unknown) {
      log.warn({ err, orgId, actorId }, 'checkBulkModification 失败 — degraded');
      return [];
    }
  }

  // ── Rule 2: 异常时段操作 ──

  /**
   * 规则 2: 检测工作时间外操作。
   * 工作时间: 06:00-22:00。之外 → 告警。
   */
  static async checkOffHoursActivity(
    orgId: string,
    actorId: string,
    store: AuditStore,
  ): Promise<BehaviorAlert[]> {
    try {
      const entries = store.rawQuery(
        `SELECT created_at FROM audit_log
         WHERE org_id = ? AND actor_id = ?
         ORDER BY created_at DESC LIMIT 5`,
        [orgId, actorId],
      );

      const offHours = (entries as Array<{ created_at: string }>).filter(row => {
        const hour = new Date(row.created_at).getHours();
        return hour < 6 || hour >= 22;
      });

      if (offHours.length > 0) {
        return [{
          ruleId: 'off_hours_activity',
          severity: 'warning',
          orgId,
          actorId,
          title: '异常时段操作',
          description: `${actorId} 在非工作时间（${offHours.length} 条）执行了操作`,
          triggeredAt: new Date().toISOString(),
          metadata: { offHourCount: offHours.length },
        }];
      }
      return [];
    } catch (err: unknown) {
      log.warn({ err, orgId, actorId }, 'checkOffHoursActivity 失败 — degraded');
      return [];
    }
  }

  // ── Rule 3: 快速连续纠错 ──

  /**
   * 规则 3: 检测 30 分钟内大量纠错操作。
   * 阈值: >5 次 correction → 告警
   */
  static async checkRapidCorrections(
    orgId: string,
    actorId: string,
    store: AuditStore,
  ): Promise<BehaviorAlert[]> {
    try {
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const entries = store.rawQuery(
        `SELECT COUNT(*) as cnt FROM audit_log
         WHERE org_id = ? AND actor_id = ? AND action = 'ga.correction' AND created_at >= ?`,
        [orgId, actorId, since],
      );
      const count = (entries as Array<Record<string, unknown>>)?.[0]?.cnt as number || 0;

      if (count >= 5) {
        return [{
          ruleId: 'rapid_corrections',
          severity: 'warning',
          orgId,
          actorId,
          title: '快速连续纠错',
          description: `${actorId} 在 30 分钟内纠错了 ${count} 条专家结论`,
          triggeredAt: new Date().toISOString(),
          metadata: { count, windowMinutes: 30 },
        }];
      }
      return [];
    } catch (err: unknown) {
      log.warn({ err, orgId, actorId }, 'checkRapidCorrections 失败 — degraded');
      return [];
    }
  }

  // ── Rule 4: 系统性下调阈值 ──

  /**
   * 规则 4: 检测 24 小时内大量下调阈值行为。
   * 阈值: >3 次下调幅度 >30% → 告警
   */
  static async checkThresholdManipulation(
    orgId: string,
    actorId: string,
    store: AuditStore,
  ): Promise<BehaviorAlert[]> {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const entries = store.rawQuery(
        `SELECT old_value, new_value FROM audit_log
         WHERE org_id = ? AND actor_id = ? AND action = 'threshold.update'
         AND created_at >= ?`,
        [orgId, actorId, since],
      ) as Array<{ old_value: string | null; new_value: string | null }>;

      let significantDrops = 0;
      for (const row of entries) {
        try {
          if (!row.old_value || !row.new_value) continue;
          const oldThreshold = JSON.parse(row.old_value).threshold;
          const newThreshold = JSON.parse(row.new_value).threshold;
          if (typeof oldThreshold === 'number' && typeof newThreshold === 'number') {
            const drop = (oldThreshold - newThreshold) / oldThreshold;
            if (drop > 0.3) significantDrops++;
          }
        } catch (err) {
          log.warn({ err: err instanceof Error ? err.message : String(err) }, "阈值对比解析失败");
          // 解析失败跳过
        }
      }

      if (significantDrops >= 4) {
        return [{
          ruleId: 'threshold_manipulation',
          severity: 'critical',
          orgId,
          actorId,
          title: '系统性下调阈值',
          description: `${actorId} 在 24 小时内下调了 ${significantDrops} 个哨兵阈值 >30%`,
          triggeredAt: new Date().toISOString(),
          metadata: { significantDrops, windowHours: 24 },
        }];
      }
      return [];
    } catch (err: unknown) {
      log.warn({ err, orgId, actorId }, 'checkThresholdManipulation 失败 — degraded');
      return [];
    }
  }
}
