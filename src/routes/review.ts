/** routes/review.ts — 人工审核队列 (Batch 3 #12)
 *  铁律 39: L1→L2 ✅ (通过 review-service) */

import { Router, type Request, type Response } from 'express';
import { enqueueReview, listReviews } from '../agent/review-service';
import { createLogger } from '@synova/logger';
const log = createLogger('src.routes.review');

const router = Router();

router.post('/api/review/queue', (req: Request, res: Response) => {
  try {
    const { findingId, reason, priority } = req.body;
    if (!findingId) return res.status(400).json({ ok: false, error: 'findingId required' });
    const item = enqueueReview(findingId, reason || '', priority || 'medium');
    res.status(201).json({ ok: true, reviewId: item.id, status: item.status });
  } catch (err: any) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "审查入队失败");
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/api/review/queue', (_req: Request, res: Response) => {
  try {
    const items = listReviews();
    res.json({ ok: true, items, count: items.length });
  } catch (err: any) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "审查列表查询");
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
