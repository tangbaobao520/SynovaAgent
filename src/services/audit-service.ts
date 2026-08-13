/**
 * services/audit-service.ts — 审计日志服务 (Phase 0.3, Desktop 实施方案)
 *
 * 对 AuditStore 的静态方法封装。
 * 设计原则:
 * - 应用层无需创建 AuditStore 实例，通过 AuditService 静态方法操作
 * - 未初始化时写入降级（不抛异常）
 * - 铁律 24+31: 所有错误路径有 log + degraded
 */
import { createLogger } from '@synova/logger';
import { AuditStore, type AuditEntryInput, type AuditEntry, type AuditQuery } from '../l4/audit-store';
import { BehaviorMonitor } from './behavior-monitor';

const log = createLogger('services/audit-service');

let _store: AuditStore | null = null;

export class AuditService {
  private constructor() {} // 静态类

  /**
   * 初始化审计服务。
   * @param db - better-sqlite3 Database 实例
   */
  static init(db: import('better-sqlite3').Database): void {
    try {
      _store = new AuditStore(db);
      log.info('审计服务已初始化');
    } catch (err: unknown) {
      log.warn({ err }, '审计服务初始化失败 — degraded');
      _store = null;
    }
  }

  /**
   * 获取底层 AuditStore 实例。
   */
  static getStore(): AuditStore | null {
    return _store;
  }

  /**
   * 写入审计日志。
   * 未初始化或写入失败时降级。
   */
  static log(entry: AuditEntryInput): void {
    if (!_store) {
      log.warn({ action: entry.action }, '审计服务未初始化，跳过日志 — degraded');
      return;
    }
    _store.log(entry);

    // Phase 0.4: 异步触发 GA 行为监控
    BehaviorMonitor.evaluate(entry, _store).catch((err) => {
      // 异步错误已被 evaluate 内部消化，这里仅保险
      log.warn({ err }, 'GA 行为监控评估失败 — 仅保险兜底');
    });
  }

  /**
   * 查询审计日志。
   * 未初始化时返回空数组。
   */
  static query(orgId: string, filters: AuditQuery): AuditEntry[] {
    if (!_store) {
      log.warn({ orgId }, '审计服务未初始化，返回空结果 — degraded');
      return [];
    }
    return _store.query(orgId, filters);
  }

  /**
   * 查询指定 GA 的操作历史。
   */
  static getGAHistory(orgId: string, gaId: string): AuditEntry[] {
    if (!_store) {
      log.warn({ orgId, gaId }, '审计服务未初始化，返回空结果 — degraded');
      return [];
    }
    return _store.getGAHistory(orgId, gaId);
  }

  /**
   * 重置实例（用于测试）。
   */
  static resetInstance(): void {
    _store = null;
  }
}
