/**
 * health.ts — 健康检查端点
 *
 * GET /health → { status, name, version, uptime }
 */
import { Router } from 'express';
import { checkForUpdates, getCurrentVersion } from '../services/update-checker';

const router = Router();
const startTime = Date.now();

const VERSION = getCurrentVersion();

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    name: 'Synova-Agent',
    version: VERSION,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  });
});

/** GET /api/update/check — Web 版本更新检测 */
router.get('/api/update/check', async (_req, res) => {
  try {
    const result = await checkForUpdates();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.json({
      ok: false,
      hasUpdate: false,
      currentVersion: getCurrentVersion(),
      error: err.message,
    });
  }
});

export default router;
