/**
 * health.ts — 健康检查端点
 *
 * GET /health → { status, name, version, uptime }
 */
import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { checkForUpdates, getCurrentVersion } from '../services/update-checker';

const router = Router();
const startTime = Date.now();

const VERSION = (() => {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version || '0.0.0';
  } catch { return '0.0.0'; }
})();

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    name: 'synova-agent',
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
