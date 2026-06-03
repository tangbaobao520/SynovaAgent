/**
 * monitoring/routes.ts — 监控端点 (Era 3.5)
 *
 * GET /api/metrics → Prometheus 格式指标
 */
import { Router, type Request, type Response } from 'express';
import { metrics } from './metrics';

const router = Router();

router.get('/api/metrics', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(metrics.getMetrics());
});

export default router;
