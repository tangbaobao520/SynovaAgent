import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
import { extractAuthFromRequest } from '../middleware/auth';

const log = createLogger('routes/ga-corrections');
const router = Router();

async function getStore() {
  const { getAgentMemoryStore } = await import('../l4/agent-memory-store');
  const { getDatabase } = await import('../init/engine-context');
  return getAgentMemoryStore(getDatabase());
}

function requireGa(req: Request, res: Response): boolean {
  const auth = extractAuthFromRequest(req);
  if (!auth) { res.status(401).json({ ok: false, code: 'UNAUTHORIZED' }); return false; }
  // D338 fail-closed 中国墙: 缺组织上下文 → 拒绝，绝不回落 'default' 共享命名空间
  if (!auth.orgId) { res.status(400).json({ ok: false, code: 'ORG_REQUIRED', message: '缺少组织上下文' }); return false; }
  if (auth.role !== 'ga' && auth.role !== 'admin') { res.status(403).json({ ok: false, code: 'FORBIDDEN' }); return false; }
  return true;
}

router.post('/api/ga/corrections', async (req: Request, res: Response) => {
  try {
    if (!requireGa(req, res)) return;
    const auth = extractAuthFromRequest(req)!;
    const { reportId, expertType, originalFinding, correctedFinding, reason } = req.body as Record<string, string>;
    if (!reportId || !expertType || !originalFinding || !correctedFinding)
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: '缺少必填字段' });
    const store = await getStore();
    store.remember({
      orgId: auth.orgId, key: `ga_correction:${reportId}:${Date.now()}`,
      value: JSON.stringify({ reportId, expertType, originalFinding, correctedFinding, reason: reason || '', gaId: auth.userId, orgId: auth.orgId }),
      type: 'ga_correction', confidence: 1.0, source: `ga:${auth.userId}`,
      tags: ['ga_correction', reportId, expertType], expiresAt: null,
    });
    log.warn({ reportId, gaId: auth.userId }, 'GA 纠错已提交');
    res.status(201).json({ ok: true });
  } catch (err: unknown) {
    log.error({ err }, '提交纠错异常');
    res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: (err as Error).message || '', degraded: true });
  }
});

router.get('/api/ga/corrections', async (req: Request, res: Response) => {
  try {
    if (!requireGa(req, res)) return;
    const auth = extractAuthFromRequest(req)!;
    const store = await getStore();
    const results = store.list({ orgId: auth.orgId, tags: ['ga_correction'] });
    const corrections = results.filter((r: any) => r.type === 'ga_correction')
      .map((r: any) => ({ id: r.key, ...JSON.parse(r.value), createdAt: r.createdAt }));
    res.json({ ok: true, corrections, total: corrections.length });
  } catch (err: unknown) { log.error({ err }, '查询纠错异常'); res.status(500).json({ ok: false, degraded: true }); }
});

export default router;
