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
// 铁律 39: L1 不直接触 L4 — KnowledgeStore 经 L2 桥接 re-export（knowledge.ts 同款先例）
import { KnowledgeStore } from '../agent/knowledge-bridge-service';
import { getDatabase } from '../init/engine-context';
import { FederatedPipeline } from '../services/federated-pipeline';

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
 * getStore — D391 M3 兜底：注入优先，未注入时实例化
 * 契约:
 *   @input  — 无（读模块级注入状态）
 *   @output — KnowledgeStore 实例（注入的 mock/实例优先；否则 new KnowledgeStore(getDatabase())）
 *   @degraded — DB 未初始化 → getDatabase() throw → 由调用方 handler catch → 500 + degraded:true（铁律 24/31）
 */
function getStore(): KnowledgeStore {
  return knowledgeStore ?? new KnowledgeStore(getDatabase());
}

/**
 * getPipeline — D391 M3 兜底：注入优先，未注入时实例化
 * 契约:
 *   @input  — 无（读模块级注入状态）
 *   @output — FederatedPipeline 实例（注入优先；否则 new FederatedPipeline()，构造无外部依赖、内存态）
 *   @degraded — 无降级路径（构造不触 DB）；方法级错误由调用方 handler catch → 500 + degraded:true
 */
function getPipeline(): FederatedPipeline {
  return federatedPipeline ?? new FederatedPipeline();
}

/**
 * GET /api/admin/knowledge/pending
 * 返回待审批的知识条目（pkb_status = 'draft'）。
 */
router.get('/api/admin/knowledge/pending', (_req, res) => {
  try {
    const pending = getStore().listPendingPkb();
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
    getStore().approvePkb(req.params.id, (req.headers['x-user-id'] as string) || 'admin');
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
    const reason = (req.body?.reason as string) || 'No reason provided';
    getStore().rejectPkb(req.params.id, (req.headers['x-user-id'] as string) || 'admin', reason);
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
    const { text, orgId } = req.body as { text?: string; orgId?: string };
    if (!text || !orgId) {
      res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'text and orgId required' });
      return;
    }
    const entry = getPipeline().markShareable(req.params.id, text, orgId);
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
    const pipeline = getPipeline();
    const pending = [
      ...pipeline.listByStatus('pending_admin'),
      ...pipeline.listByStatus('pending_ga'),
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
    const reviewer = (req.headers['x-user-id'] as string) || 'ga-admin';
    const ok = getPipeline().approveByGa(req.params.id, reviewer);
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
    const degraded = getPipeline().listByStatus('degraded');
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
    const { gaUserId } = req.body as { gaUserId?: string };
    if (!gaUserId) {
      res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'gaUserId required' });
      return;
    }
    const affected = getPipeline().checkGaWeightDrop(gaUserId);
    res.json({ ok: true, data: { gaUserId, affectedEntries: affected } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'Failed to process GA weight drop');
    res.status(500).json({ ok: false, error: msg, degraded: true });
  }
});

export default router;
