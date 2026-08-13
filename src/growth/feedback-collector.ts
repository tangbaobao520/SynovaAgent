/**
 * src/growth/feedback-collector.ts — 中层反馈收集器
 *
 * D93: 中层行为数据管道。将中层对哨兵、Goal、Proposal 的反馈收集到
 * SQLite feedback_log 表，供 D92 进化循环使用。
 *
 * 输入源:
 *   - 中层标记哨兵告警为"误报" → decision:'reject'
 *   - 中层调整 Goal 目标值 → decision:'modify'
 *   - 中层拒绝 Proposal 路径 → decision:'reject_path'
 *   - 中层闭环 Goal 但标记"无效" → decision:'ineffective'
 *
 * 契约:
 *   @input  — MiddleFeedbackInput
 *   @output — FeedbackRecord（含 id/createdAt）
 *   @degraded — SQLite 写入失败 → log.warn + return degraded:true（不阻断用户操作）
 */
import { randomUUID } from 'crypto';
import { createLogger } from '@synova/logger';

const log = createLogger('growth/feedback-collector');

// ═══ Types ═══

/** 反馈决策类型 */
export type FeedbackDecision = 'reject' | 'modify' | 'reject_path' | 'ineffective';

/** 反馈目标类型 */
export type FeedbackTargetType = 'sentinel_alert' | 'goal' | 'proposal';

/** 收集反馈的输入 */
export interface MiddleFeedbackInput {
  /** 企业 ID */
  enterpriseId: string;
  /** 操作者 ID */
  actorId: string;
  /** 决策类型 */
  decision: FeedbackDecision;
  /** 反馈目标类型 */
  targetType: FeedbackTargetType;
  /** 反馈目标 ID */
  targetId: string;
  /** 反馈理由（可选） */
  reason?: string;
  /** 证据引用（可选，相关快照/日志 ID） */
  /** 操作者角色（D93b — 支持 D92 矛盾检测） */
  actorRole?: string;
  evidenceRefs?: string[];
}

/** 持久化的反馈记录 */
export interface FeedbackRecord {
  /** 唯一标识 */
  id: string;
  /** 企业 ID */
  enterpriseId: string;
  /** 操作者 ID */
  actorId: string;
  /** 决策类型 */
  decision: FeedbackDecision;
  /** 反馈目标类型 */
  targetType: FeedbackTargetType;
  /** 反馈目标 ID */
  targetId: string;
  /** 反馈理由 */
  reason: string;
  /** 证据引用（JSON 序列化数组） */
  evidenceRefs: string;
  /** 操作者角色（D93b — 支持 D92 矛盾检测） */
  actorRole: string;
  /** 创建时间 */
  createdAt: string;
}

/** 查询过滤条件 */
export interface FeedbackQuery {
  enterpriseId?: string;
  decision?: FeedbackDecision;
  targetType?: FeedbackTargetType;
  targetId?: string;
  since?: string;
  limit?: number;
}

/** 聚合信号 */
export interface AggregatedSignal {
  /** 相同的 sentinel/decision 组合 */
  key: string;
  /** 信号类型 */
  decision: FeedbackDecision;
  /** 目标类型 */
  targetType: FeedbackTargetType;
  /** 聚合次数 */
  count: number;
  /** 最新反馈时间 */
  latestTimestamp: string;
  /** 相关目标 ID 列表 */
  targetIds: string[];
}

// ═══ SQLite DDL ═══

export const FEEDBACK_DDL = `
CREATE TABLE IF NOT EXISTS feedback_log (
  id            TEXT PRIMARY KEY,
  enterprise_id TEXT NOT NULL,
  actor_id      TEXT NOT NULL,
  decision      TEXT NOT NULL CHECK(decision IN ('reject','modify','reject_path','ineffective')),
  target_type   TEXT NOT NULL CHECK(target_type IN ('sentinel_alert','goal','proposal')),
  target_id     TEXT NOT NULL,
  reason        TEXT DEFAULT '',
  evidence_refs TEXT DEFAULT '[]',
  actor_role    TEXT DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_feedback_enterprise ON feedback_log(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_feedback_decision ON feedback_log(decision);
CREATE INDEX IF NOT EXISTS idx_feedback_target ON feedback_log(target_type, target_id);
-- D93b: migration
CREATE TABLE IF NOT EXISTS schema_version (version TEXT PRIMARY KEY);
INSERT OR IGNORE INTO schema_version (version) VALUES ('d93b_actor_role');
`;

// ═══ FeedbackCollector ═══

export class FeedbackCollector {
  private db: import('better-sqlite3').Database | null = null;

  /** 注入 SQLite 数据库实例 */
  setDatabase(db: import('better-sqlite3').Database): void {
    this.db = db;
    this.initSchema();
  }

  /** 初始化表结构 */
  private initSchema(): void {
    if (!this.db) return;
    try {
      this.db.exec(FEEDBACK_DDL);
      log.info('feedback_log 表就绪');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, 'feedback_log 表初始化失败 — 降级（内存模式）');
    }
  }

  /**
   * 收集一条中层反馈。
   *
   * @param input - 反馈输入
   * @returns FeedbackRecord（降级时 degraded:true）
   */
  collectFeedback(input: MiddleFeedbackInput): FeedbackRecord & { degraded?: boolean } {
    const now = new Date().toISOString();
    const record: FeedbackRecord = {
      id: randomUUID(),
      enterpriseId: input.enterpriseId,
      actorId: input.actorId,
      decision: input.decision,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason || '',
      evidenceRefs: JSON.stringify(input.evidenceRefs || []),
      actorRole: input.actorRole || '',
      createdAt: now,
    };

    if (!this.db) {
      log.warn({ record }, 'SQLite 未就绪 — 反馈降级（仅内存）');
      return { ...record, degraded: true };
    }

    try {
      this.db.prepare(`
        INSERT INTO feedback_log (id, enterprise_id, actor_id, decision, target_type, target_id, reason, evidence_refs, actor_role, created_at)
        VALUES (@id, @enterpriseId, @actorId, @decision, @targetType, @targetId, @reason, @evidenceRefs, @actorRole, @createdAt)
      `).run({
        id: record.id,
        enterpriseId: record.enterpriseId,
        actorId: record.actorId,
        decision: record.decision,
        targetType: record.targetType,
        targetId: record.targetId,
        reason: record.reason,
        evidenceRefs: record.evidenceRefs,
        actorRole: record.actorRole,
        createdAt: record.createdAt,
      });
      log.info({ id: record.id, decision: record.decision }, '反馈已收集');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, record }, '反馈写入 SQLite 失败 — 降级');
      return { ...record, degraded: true };
    }

    return record;
  }

  /**
   * 查询反馈记录。
   *
   * @param filters - 过滤条件
   * @returns FeedbackRecord[]
   */
  queryFeedback(filters: FeedbackQuery): FeedbackRecord[] {
    if (!this.db) return [];

    try {
      let sql = 'SELECT * FROM feedback_log WHERE 1=1';
      const params: Record<string, unknown> = {};

      if (filters.enterpriseId) {
        sql += ' AND enterprise_id = @enterpriseId';
        params.enterpriseId = filters.enterpriseId;
      }
      if (filters.decision) {
        sql += ' AND decision = @decision';
        params.decision = filters.decision;
      }
      if (filters.targetType) {
        sql += ' AND target_type = @targetType';
        params.targetType = filters.targetType;
      }
      if (filters.targetId) {
        sql += ' AND target_id = @targetId';
        params.targetId = filters.targetId;
      }
      if (filters.since) {
        sql += ' AND created_at >= @since';
        params.since = filters.since;
      }

      sql += ' ORDER BY created_at DESC';

      if (filters.limit && filters.limit > 0) {
        sql += ' LIMIT @limit';
        params.limit = filters.limit;
      }

      const rows = this.db.prepare(sql).all(params) as Array<Record<string, unknown>>;
      return rows.map(r => ({
        id: r.id as string,
        enterpriseId: r.enterprise_id as string,
        actorId: r.actor_id as string,
        decision: r.decision as FeedbackDecision,
        targetType: r.target_type as FeedbackTargetType,
        targetId: r.target_id as string,
        reason: (r.reason as string) || '',
        evidenceRefs: (r.evidence_refs as string) || '[]',
        actorRole: (r.actor_role as string) || '',
        createdAt: r.created_at as string,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, '反馈查询失败 — 降级');
      return [];
    }
  }

  /**
   * 获取聚合信号。
   * 同一 sentinel × 同一 decision 类型出现 >= threshold 次时聚合为一条 signal。
   *
   * @param threshold - 聚合阈值（默认 3）
   * @returns AggregatedSignal[]
   */
  getAggregatedSignals(threshold: number = 3): AggregatedSignal[] {
    if (!this.db) return [];

    try {
      const rows = this.db.prepare(`
        SELECT decision, target_type, actor_role, COUNT(*) as count, MAX(created_at) as latest, GROUP_CONCAT(target_id, ',') as targets
        FROM feedback_log
        GROUP BY decision, target_type, actor_role
        HAVING count >= @threshold
        ORDER BY count DESC
      `).all({ threshold }) as Array<Record<string, unknown>>;

      return rows.map(r => ({
        key: `${r.decision}:${r.target_type}:${r.actor_role || ''}`,
        decision: r.decision as FeedbackDecision,
        targetType: r.target_type as FeedbackTargetType,
        actorRoles: ((r.actor_role as string) || '').split(',').filter(Boolean),
        count: r.count as number,
        latestTimestamp: r.latest as string,
        targetIds: ((r.targets as string) || '').split(',').filter(Boolean),
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, '聚合信号查询失败 — 降级');
      return [];
    }
  }
}

/** 全局单例 */
export const feedbackCollector = new FeedbackCollector();

/** D262: 单例工厂 — 获取全局 FeedbackCollector 实例 */
export function getFeedbackCollector(): FeedbackCollector {
  return feedbackCollector;
}
