/**
 * routes/admin-knowledge.ts — D241 知识审批 API
 *
 * GET  /api/admin/knowledge/pending       — 待审批知识列表
 * POST /api/admin/knowledge/:id/approve   — 审批通过
 * POST /api/admin/knowledge/:id/reject    — 驳回
 */
import { Router } from 'express';
import { createLogger } from '@synova/logger';
import { KnowledgeStore } from '../l4/knowledge-store';
import type { Database } from 'better-sqlite3';

const log = createLogger('routes/admin-knowledge');
const router = Router();

let knowledgeStore: KnowledgeStore | null = null;

export function setKnowledgeStore(store: KnowledgeStore): void {
  knowledgeStore = store;
}

/**
 * GET /api/admin/knowledge/pending
 * 返回待审批的知识条目（pkb_status = 'draft'）。
 */
router.get('/api/admin/knowledge/pending', (_req, res) => {
  try {
    if (!knowledgeStore) {
      res.status(503).json({ ok: false, error: 'KnowledgeStore not ready', degraded: true });
      return;
    }
    const pending = knowledgeStore.listPendingPkb();
    res.json({ ok: true, data: pending, count: pending.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'Failed to list pending PKB');
    res.status(500).json({ ok: false, error: msg, degraded: true });
  }
});

/**
 * POST /api/admin/knowledge/:id/approve
 * 审批通过一条知识。
 */
router.post('/api/admin/knowledge/:id/approve', (req, res) => {
  try {
    if (!knowledgeStore) {
      res.status(503).json({ ok: false, error: 'KnowledgeStore not ready', degraded: true });
      return;
    }
    knowledgeStore.approvePkb(req.params.id, (req.headers['x-user-id'] as string) || 'admin');
    res.json({ ok: true, data: { id: req.params.id, status: 'approved' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg, id: req.params.id }, 'Failed to approve PKB');
    res.status(500).json({ ok: false, error: msg, degraded: true });
  }
});

/**
 * POST /api/admin/knowledge/:id/reject
 * 驳回一条知识，需提供原因。
 */
router.post('/api/admin/knowledge/:id/reject', (req, res) => {
  try {
    if (!knowledgeStore) {
      res.status(503).json({ ok: false, error: 'KnowledgeStore not ready', degraded: true });
      return;
    }
    const reason = (req.body?.reason as string) || 'No reason provided';
    knowledgeStore.rejectPkb(req.params.id, (req.headers['x-user-id'] as string) || 'admin', reason);
    res.json({ ok: true, data: { id: req.params.id, status: 'rejected', reason } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg, id: req.params.id }, 'Failed to reject PKB');
    res.status(500).json({ ok: false, error: msg, degraded: true });
  }
});

export default router;
