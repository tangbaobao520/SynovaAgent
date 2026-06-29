/**
 * routes/sentinel.ts — Sentinel 哨兵 API (L1)
 * @state: real
 *
 * GET  /api/sentinel/findings   — 哨兵发现列表 (可按 sentinelId/severity 过滤)
 * GET  /api/sentinel/signals    — 信号聚合结果 (交叉关联 + 专家建议)
 * POST /api/sentinel/run/:id    — 手动触发一次哨兵检查
 *
 * 铁律 39: L1 通过 L2 sentinel-service 获取数据，不直接访问 L3。
 */

import { Router, type Request, type Response } from 'express';
import {
  getSentinelFindings,
  getAggregatedSignals,
  runSentinelOnce,
  getSentinelExpertReports,
  getSentinelTickets,
} from '../agent/sentinel-service';
import { createLogger } from '@synova/logger';

const log = createLogger('routes/sentinel');
const router = Router();

// ═══ GET /api/sentinel/findings ═══

router.get('/findings', (req: Request, res: Response) => {
  try {
    const sentinelId = typeof req.query.sentinelId === 'string' ? req.query.sentinelId : undefined;
    const severity = ['critical', 'warning', 'info'].includes(req.query.severity as string)
      ? (req.query.severity as 'critical' | 'warning' | 'info')
      : undefined;
    const limit = req.query.limit ? Math.min(Math.max(1, parseInt(req.query.limit as string, 10) || 50), 200) : 50;
    const offset = req.query.offset ? Math.max(0, parseInt(req.query.offset as string, 10) || 0) : 0;

    const result = getSentinelFindings({ sentinelId, severity, limit, offset });
    res.json(result);
  } catch (err: unknown) {
    log.error({ err }, '[sentinel] findings 查询失败');
    res.status(500).json({ ok: false, total: 0, findings: [] });
  }
});

// ═══ GET /api/sentinel/signals ═══

router.get('/signals', (_req: Request, res: Response) => {
  try {
    const result = getAggregatedSignals();
    res.json(result);
  } catch (err: unknown) {
    log.error({ err }, '[sentinel] signals 聚合失败');
    res.status(500).json({ ok: false, total: 0, criticalCount: 0, warningCount: 0, signals: [] });
  }
});

// ═══ POST /api/sentinel/run/:id ═══

router.post('/run/:id', async (req: Request, res: Response) => {
  try {
    const sentinelId = String(req.params.id);
    if (!sentinelId) {
      res.status(400).json({ ok: false, sentinelId: '', result: null, error: '缺少 sentinelId' });
      return;
    }
    const result = await runSentinelOnce(sentinelId);
    const status = result.ok ? 200 : result.error === 'SentinelRunner 未启动' ? 503 : 404;
    res.status(status).json(result);
  } catch (err: unknown) {
    log.error({ err }, '[sentinel] runOnce 失败');
    res.status(500).json({ ok: false, sentinelId: req.params.id, result: null, error: (err as Error)?.message || '未知错误' });
  }
});

// ═══ GET /api/sentinel/reports ═══

router.get('/reports', (_req: Request, res: Response) => {
  try {
    const result = getSentinelExpertReports();
    res.json(result);
  } catch (err: unknown) {
    log.error({ err }, '[sentinel] reports 查询失败');
    res.status(500).json({ ok: false, total: 0, reports: [] });
  }
});

// ═══ GET /api/sentinel/tickets ═══

router.get('/tickets', (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const result = getSentinelTickets();
    res.json(result);
  } catch (err: unknown) {
    log.error({ err }, '[sentinel] tickets 查询失败');
    res.status(500).json({ ok: false, total: 0, tickets: [] });
  }
});

export default router;
