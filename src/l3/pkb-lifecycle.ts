/**
 * l3/pkb-lifecycle.ts — PKB 知识生命周期管理 (Slice 3+4)
 *
 * Gear6 扩展: 置信度衰减、冲突检测、过期标记、诊断反馈回路。
 * 铁律 39: L3 通过 KnowledgeStore(L4) 操作数据，不直接访问 L5 数据库。
 */
import { KnowledgeStore } from '../l4/knowledge-store';
import type Database from 'better-sqlite3';
import { createLogger } from '../logger';

const log = createLogger('l3/pkb-lifecycle');

/**
 * 运行 PKB 生命周期维护 — 由 Gear6 定时调用。
 * @param db SQLite 数据库实例 (由 L2/server.ts 传入)
 */
export function runPKBLifecycle(db: Database.Database): { decayed: number; conflicts: number; expired: number; feedbackApplied: number } {
  const store = new KnowledgeStore(db);

  const decayed = store.decayConfidence(0.95);
  const expired = store.expireOutdated();
  const conflicts = store.detectConflicts();
  const feedbackApplied = store.applyFeedback();

  if (decayed > 0 || conflicts > 0 || expired > 0 || feedbackApplied > 0) {
    log.info({ decayed, conflicts, expired, feedbackApplied }, 'PKB 生命周期维护完成');
  }
  return { decayed, conflicts, expired, feedbackApplied };
}
