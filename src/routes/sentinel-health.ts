/**
 * routes/sentinel-health.ts — Sentinel 健康检查 API (L1)
 * @state: real
 *
 * GET /api/sentinel/health — 返回所有已注册哨兵的状态 + 基线统计
 *
 * 铁律 39: L1 通过 L2 sentinel-health-service 获取数据，不直接访问 L3。
 */

import { Router, type Request, type Response } from 'express';
import { getSentinelHealthReport } from '../agent/sentinel-health-service';
import { createLogger } from '../logger';

const log = createLogger('routes/sentinel-health');
const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  try {
    res.json(getSentinelHealthReport());
  } catch (err: any) {
    log.error({ err }, '哨兵健康检查失败');
    res.status(500).json({ ok: false, error: err.message, sentinels: [] });
  }
});

export default router;
