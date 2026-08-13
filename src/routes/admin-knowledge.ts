/**
 * routes/admin-knowledge.ts — D241 知识审批 API + D244 联邦知识
 *
 * D241:
 *   GET  /api/admin/knowledge/pending       — 待审批知识列表
 *   POST /api/admin/knowledge/:id/approve   — 审批通过
 *   POST /api/admin/knowledge/:id/reject    — 驳回
 *
 * D244:
 *   POST /api/admin/knowledge/:id/mark-shareable  — 标记可共享
 *   GET  /api/admin/knowledge/federated/pending   — 待审核联邦列表
 *   POST /api/admin/knowledge/federated/:id/approve — GA 审批联邦
 *   GET  /api/admin/knowledge/federated/degraded  — 降级联邦列表
 */
import { Router } from 'express';
import { createLogger } from '@synova/logger';
import { KnowledgeStore } from '../l4/knowledge-store';
import { FederatedPipeline } from '../services/federated-pipeline';
import type { Database } from 'better-sqlite3';

const log = createLogger('routes/admin-knowledge');
const router = Router();

let knowledgeStore: KnowledgeStore | null = null;
let federatedPipeline: FederatedPipeline | null = null;

export function setKnowledgeStore(store: KnowledgeStore): void {
  knowledgeStore = store;
}

export function setFederatedPipeline(pipeline: FederatedPipeline): void {
  federatedPipeline = pipeline;
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

// ═══════════════════════════════════════════════════════════════════════════
// D244: 联邦知识 API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/admin/knowledge/:id/mark-shareable
 * 管理员标记知识为可共享 → 脱敏 → pending_admin
 */
router.post('/api/admin/knowledge/:id/mark-shareable', (req, res) => {
  try {
    if (!federatedPipeline) {
      res.status(503).json({ ok: false, error: 'FederatedPipeline not ready', degraded: true });
      return;
    }
    if (!knowledgeStore) {
      res.status(503).json({ ok: false, error: 'KnowledgeStore not ready', degraded: true });
      return;
    }
    const { text, orgId } = req.body as { text?: string; orgId?: string };
    if (!text || !orgId) {
      res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'text and orgId required' });
      return;
    }
    const entry = federatedPipeline.markShareable(req.params.id, text, orgId);
    res.status(201).json({ ok: true, data: entry });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg, id: req.params.id }, 'Failed to mark shareable');
    res.status(500).json({ ok: false, error: msg, degraded: true });
  }
});

/**
 * GET /api/admin/knowledge/federated/pending
 * 待 GA 审批的联邦知识列表 (pending_admin / pending_ga)
 */
router.get('/api/admin/knowledge/federated/pending', (_req, res) => {
  try {
    if (!federatedPipeline) {
      res.status(503).json({ ok: false, error: 'FederatedPipeline not ready', degraded: true });
      return;
    }
    const pending = [
      ...federatedPipeline.listByStatus('pending_admin'),
      ...federatedPipeline.listByStatus('pending_ga'),
    ];
    res.json({ ok: true, data: pending, count: pending.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'Failed to list federated pending');
    res.status(500).json({ ok: false, error: msg, degraded: true });
  }
});

/**
 * POST /api/admin/knowledge/federated/:id/approve
 * GA 审批: pending_admin → pending_ga
 */
router.post('/api/admin/knowledge/federated/:id/approve', (req, res) => {
  try {
    if (!federatedPipeline) {
      res.status(503).json({ ok: false, error: 'FederatedPipeline not ready', degraded: true });
      return;
    }
    const reviewer = (req.headers['x-user-id'] as string) || 'ga-admin';
    const ok = federatedPipeline.approveByGa(req.params.id, reviewer);
    if (!ok) {
      res.status(400).json({ ok: false, code: 'INVALID_STATE', message: 'Item not in pending_admin state' });
      return;
    }
    res.json({ ok: true, data: { id: req.params.id, status: 'pending_ga' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg, id: req.params.id }, 'Failed to approve federated');
    res.status(500).json({ ok: false, error: msg, degraded: true });
  }
});

/**
 * GET /api/admin/knowledge/federated/degraded
 * 已降级的联邦知识列表
 */
router.get('/api/admin/knowledge/federated/degraded', (_req, res) => {
  try {
    if (!federatedPipeline) {
      res.status(503).json({ ok: false, error: 'FederatedPipeline not ready', degraded: true });
      return;
    }
    const degraded = federatedPipeline.listByStatus('degraded');
    res.json({ ok: true, data: degraded, count: degraded.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'Failed to list degraded');
    res.status(500).json({ ok: false, error: msg, degraded: true });
  }
});

/**
 * POST /api/admin/knowledge/federated/ga-weight-drop
 * GA 离职触发 — 降低该 GA 审批过的联邦知识权重。
 */
router.post('/api/admin/knowledge/federated/ga-weight-drop', (req, res) => {
  try {
    if (!federatedPipeline) {
      res.status(503).json({ ok: false, error: 'FederatedPipeline not ready', degraded: true });
      return;
    }
    const { gaUserId } = req.body as { gaUserId?: string };
    if (!gaUserId) {
      res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'gaUserId required' });
      return;
    }
    const affected = federatedPipeline.checkGaWeightDrop(gaUserId);
    res.json({ ok: true, data: { gaUserId, affectedEntries: affected } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'Failed to process GA weight drop');
    res.status(500).json({ ok: false, error: msg, degraded: true });
  }
});

export default router;
