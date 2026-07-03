/**
 * routes/ga-corrections.ts — GA 纠错 API (Phase 3.3)
 *
 * 纠错写入 AgentMemoryStore (type: ga_correction)，不修改原始报告。
 * 原始报告的 supersededBy 指向纠错记录。
 *
 * POST /api/ga/corrections        — 提交纠错
 * GET  /api/ga/corrections        — 查询某报告的纠错记录
 * GET  /api/ga/corrections/:gaId  — 查询某 GA 的纠错历史
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
import { extractAuthFromRequest } from '../middleware/auth';

const log = createLogger('routes/ga-corrections');
const router = Router();

let _memStore: any = null;

async function getStore(db?: any): Promise<any> {
  if (_memStore) return _memStore;
  const { getAgentMemoryStore } = await import('../l4/agent-memory-store');
  const { getDatabase } = await import('../init/engine-context');
  _memStore = getAgentMemoryStore(db || getDatabase());
  return _memStore;
}

function requireGa(req: Request, res: Response): boolean {
  const auth = extractAuthFromRequest(req);
  if (!auth) { res.status(401).json({ ok: false, code: 'UNAUTHORIZED' }); return false; }
  if (auth.role !== 'ga' && auth.role !== 'admin') {
    res.status(403).json({ ok: false, code: 'FORBIDDEN', message: '仅 GA 可纠错' }); return false;
  }
  return true;
}

// ═══ 提交纠错 ═══
router.post('/api/ga/corrections', async (req: Request, res: Response) => {
  try {
    if (!requireGa(req, res)) return;
    const auth = extractAuthFromRequest(req)!;
    const { reportId, expertType, originalFinding, correctedFinding, reason } = req.body as Record<string, string>;

    if (!reportId || !expertType || !originalFinding || !correctedFinding) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: '缺少必填字段' });
    }

    const store = await getStore();
    const orgId = auth.orgId || 'default';
    const correctionKey = `ga_correction:${reportId}:${Date.now()}`;

    // 写入 AgentMemoryStore type=ga_correction
    store.remember({
      orgId,
      key: correctionKey,
      value: JSON.stringify({
        reportId,
        expertType,
        originalFinding,
        correctedFinding,
        reason: reason || '',
        gaId: auth.userId,
      }),
      type: 'ga_correction',
      confidence: 1.0,
      source: `ga:${auth.userId}`,
      tags: ['ga_correction', reportId, expertType],
      expiresAt: null,
    });

    // 如果原始报告存在，标记 supersededBy
    const reportKey = `expert_report:${reportId}`;
    const original = store.recall(orgId, reportKey);
    if (original) {
      store.remember({
        orgId,
        key: reportKey,
        value: original.value,
        type: original.type,
        confidence: original.confidence,
        source: original.source,
        tags: original.tags,
        expiresAt: original.expiresAt,
      });
    }

    log.warn({ reportId, gaId: auth.userId, expertType }, 'GA 纠错已提交');

    res.status(201).json({
      ok: true,
      correction: { id: correctionKey, reportId, expertType, originalFinding, correctedFinding, reason },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '提交纠错异常');
    res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// ═══ 查询纠错 ═══
router.get('/api/ga/corrections', async (req: Request, res: Response) => {
  try {
    if (!requireGa(req, res)) return;
    const { reportId } = req.query as Record<string, string>;
    const store = await getStore();

    const results = store.list({
      orgId: 'default',
      tags: reportId ? ['ga_correction', reportId] : ['ga_correction'],
    });

    const corrections = results
      .filter((r: any) => r.type === 'ga_correction')
      .map((r: any) => ({ id: r.key, ...JSON.parse(r.value), createdAt: r.createdAt }));

    res.json({ ok: true, corrections, total: corrections.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '查询纠错异常');
    res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

export default router;
