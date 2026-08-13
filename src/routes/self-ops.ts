/**
 * routes/self-ops.ts ? ????? API ?? (D52-FIX)
 *
 * ?? system-self-ops.ts ?????????
 * ???????????? GA ??????????
 *
 * ??:
 *   @input  ? POST body: { op: string, params?: Record<string,unknown> }
 *   @output ? SelfOpResult { success, approved, result?, approvalTicketId?, warnings?: string[] }
 *   @degraded ? ??????????????
 *
 * ?? 24+31: catch + log.warn + degraded ??
 * ?? 38: ? as any
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
import {
  executeSelfOp,
  collectHealthSnapshot,
  listAvailableOps,
} from '../deploy/system-self-ops';

const log = createLogger('routes/self-ops');
const router = Router();

/**
 * GET /api/self-ops/health
 * ????????????
 */
router.get('/api/self-ops/health', (_req: Request, res: Response) => {
  try {
    const snapshot = collectHealthSnapshot();
    res.json({ ok: true, data: snapshot });
  } catch (err) {
    log.error({ err }, '????????');
    res.status(500).json({ ok: false, error: '????', degraded: true });
  }
});

/**
 * GET /api/self-ops
 * ??????????
 */
router.get('/api/self-ops', (_req: Request, res: Response) => {
  try {
    const ops = listAvailableOps();
    res.json({ ok: true, data: ops });
  } catch (err) {
    log.error({ err }, '????????');
    res.status(500).json({ ok: false, error: '????', degraded: true });
  }
});

/**
 * POST /api/self-ops/execute
 * ???????????????????????????
 */
router.post('/api/self-ops/execute', (req: Request, res: Response) => {
  try {
    const { op, params, requestedBy } = req.body || {};

    if (!op || !requestedBy) {
      res.status(400).json({
        ok: false,
        error: '?????? op ? requestedBy',
      });
      return;
    }

    const result = executeSelfOp({ op, params, requestedBy });

    if (!result.success && !result.requiresApproval) {
      res.status(500).json({ ok: false, ...result });
      return;
    }

    if (result.requiresApproval) {
      res.status(202).json({ ok: true, ...result });
      return;
    }

    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err }, '????????');
    res.status(500).json({ ok: false, error: '????', degraded: true });
  }
});

export default router;
