/**
 * l4/review-store.ts — 审核队列存储 (L4)
 * @state: real
 *
 * 提供 review_queue 表的 CRUD 操作。L1 路由通过此接口访问，
 * 不直接写 SQL。
 *
 * 铁律 39: L4→L5 ✅ | L1→L4 ❌ (通过 L2 服务桥接)
 */

import type Database from 'better-sqlite3';
import { getDatabase } from '../init/engine-context';

const TABLE_DDL = `CREATE TABLE IF NOT EXISTS review_queue (
  id TEXT PRIMARY KEY,
  finding_id TEXT,
  reason TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
)`;

export interface ReviewItem {
  id: string; finding_id: string; reason: string;
  priority: string; status: string; created_at: string;
}

export class ReviewStore {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
    this.db.exec(TABLE_DDL);
  }

  enqueue(findingId: string, reason: string, priority: string): ReviewItem {
    const id = `review_${Date.now().toString(36)}`;
    this.db.prepare(
      'INSERT INTO review_queue (id,finding_id,reason,priority) VALUES (?,?,?,?)'
    ).run(id, findingId, reason || '', priority || 'medium');
    return { id, finding_id: findingId, reason: reason || '', priority: priority || 'medium', status: 'pending', created_at: new Date().toISOString() };
  }

  list(limit = 50): ReviewItem[] {
    return this.db.prepare(
      'SELECT * FROM review_queue ORDER BY created_at DESC LIMIT ?'
    ).all(limit) as ReviewItem[];
  }
}

let _instance: ReviewStore | null = null;
export function getReviewStore(): ReviewStore {
  if (!_instance) _instance = new ReviewStore();
  return _instance;
}
