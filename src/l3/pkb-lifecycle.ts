/**
 * l3/pkb-lifecycle.ts — PKB 知识生命周期管理 (Slice 3+4)
 *
 * Gear6 扩展: 置信度衰减、冲突检测、过期标记、诊断反馈回路
 */
import { KnowledgeStore } from '../l4/knowledge-store';
import { getDatabase } from '../init/engine-context';
import { createLogger } from '../logger';

const log = createLogger('l3/pkb-lifecycle');

/**
 * 运行 PKB 生命周期维护 — 由 Gear6 定时调用。
 */
export function runPKBLifecycle(): { decayed: number; conflicts: number; expired: number; feedbackApplied: number } {
  const store = new KnowledgeStore(getDatabase());
  const db = getDatabase();

  // ═══ 1. 置信度衰减 (Slate 3) ═══
  const decayed = store.decayConfidence(0.95);

  // ═══ 2. 过期检测 (Slice 3) ═══
  const expired = store.expireOutdated();

  // ═══ 3. 冲突检测 (Slice 3) ═══
  const conflicts = detectConflicts(db);

  // ═══ 4. 诊断反馈处理 (Slice 4) ═══
  const feedbackApplied = applyFeedback(db, store);

  if (decayed > 0 || conflicts > 0 || expired > 0 || feedbackApplied > 0) {
    log.info({ decayed, conflicts, expired, feedbackApplied }, 'PKB 生命周期维护完成');
  }
  return { decayed, conflicts, expired, feedbackApplied };
}

/** 检测同 domain 内相似知识的潜在冲突 */
function detectConflicts(db: ReturnType<typeof getDatabase>): number {
  try {
    const rows = db.prepare(`
      SELECT a.id as id1, a.pkb_domain, a.text as text1, b.id as id2, b.text as text2
      FROM knowledge_chunks a
      JOIN knowledge_chunks b ON a.pkb_domain = b.pkb_domain AND a.id < b.id
      WHERE a.pkb_domain IS NOT NULL AND a.pkb_status = 'active' AND b.pkb_status = 'active'
      LIMIT 100
    `).all() as Array<Record<string, unknown>>;

    let count = 0;
    for (const r of rows) {
      const t1 = (r.text1 as string).toLowerCase();
      const t2 = (r.text2 as string).toLowerCase();
      // 简单 Jaccard 相似度检测
      const sim = jaccardSimilarity(t1, t2);
      if (sim > 0.8) {
        db.prepare('UPDATE knowledge_chunks SET pkb_status = ?, updated_at = ? WHERE id = ?')
          .run('reviewing', new Date().toISOString(), r.id2);
        count++;
      }
    }
    return count;
  } catch { return 0; }
}

/** 处理诊断反馈 → 调整知识置信度 (Slice 4) */
function applyFeedback(db: ReturnType<typeof getDatabase>, store: KnowledgeStore): number {
  try {
    const rows = db.prepare(`
      SELECT knowledge_entry_id, SUM(CASE WHEN result = 'confirmed' THEN 0.02 ELSE -0.05 END) as delta
      FROM diagnosis_feedback
      WHERE processed = 0
      GROUP BY knowledge_entry_id
    `).all() as Array<Record<string, unknown>>;

    for (const r of rows) {
      const id = r.knowledge_entry_id as string;
      try {
        const current = db.prepare('SELECT pkb_confidence FROM knowledge_chunks WHERE id = ?').get(id) as Record<string, unknown> | undefined;
        if (!current) continue;
        const newConf = Math.max(0, Math.min(1, (current.pkb_confidence as number || 0.7) + (r.delta as number)));
        store.update(id, { pkb_confidence: newConf, pkb_status: newConf < 0.5 ? 'deprecated' : 'active' });
      } catch { /* skip malformed entry */ }
    }

    db.prepare('UPDATE diagnosis_feedback SET processed = 1 WHERE processed = 0').run();
    return rows.length;
  } catch { return 0; }
}

function jaccardSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(a.split(/\s+/).filter(w => w.length > 1));
  const setB = new Set(b.split(/\s+/).filter(w => w.length > 1));
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  return intersection.size / (setA.size + setB.size - intersection.size);
}
