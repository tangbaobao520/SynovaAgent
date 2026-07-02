/**
 * routes/ga-corrections.ts — GA 纠错 API (Phase 3.2)
 *
 * POST /api/ga/corrections        — 提交纠错
 * GET  /api/ga/corrections        — 查询某报告的纠错记录
 * GET  /api/ga/corrections/:gaId  — 查询某 GA 的纠错历史
 *
 * 纠错写入 AgentMemoryStore (type: ga_correction), 不修改原始报告。
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
import { extractAuthFromRequest } from '../middleware/auth';

const log = createLogger('routes/ga-corrections');
const router = Router();

// In-memory correction store (Phase 3.3 迁移到 AgentMemoryStore)
interface GACorrection {
  id: string;
  orgId: string;
  gaId: string;
  reportId: string;
  expertType: string;
  originalFinding: string;
  correctedFinding: string;
  reason: string;
  createdAt: string;
}
const corrections: GACorrection[] = [];
let idSeq = 0;

/** 检查是否是 GA 角色 */
function requireGa(req: Request, res: Response): boolean {
  const auth = extractAuthFromRequest(req);
  if (!auth) { res.status(401).json({ ok: false, code: 'UNAUTHORIZED' }); return false; }
  if (auth.role !== 'ga' && auth.role !== 'admin') { res.status(403).json({ ok: false, code: 'FORBIDDEN', message: '仅 GA 可纠错' }); return false; }
  return true;
}

// ═══ 提交纠错 ═══
router.post('/api/ga/corrections', (req: Request, res: Response) => {
  try {
    if (!requireGa(req, res)) return;
    const auth = extractAuthFromRequest(req)!;
    const { reportId, expertType, originalFinding, correctedFinding, reason } = req.body as Record<string, string>;

    if (!reportId || !expertType || !originalFinding || !correctedFinding) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: '缺少必填字段' });
    }

    const correction: GACorrection = {
      id: `corr_${++idSeq}`,
      orgId: auth.orgId || 'default',
      gaId: auth.userId,
      reportId, expertType, originalFinding, correctedFinding,
      reason: reason || '',
      createdAt: new Date().toISOString(),
    };
    corrections.push(correction);

    log.warn({ correctionId: correction.id, gaId: auth.userId, reportId }, 'GA 提交纠错');

    res.status(201).json({ ok: true, correction });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '提交纠错异常');
    res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// ═══ 查询纠错 ═══
router.get('/api/ga/corrections', (req: Request, res: Response) => {
  try {
    if (!requireGa(req, res)) return;

    const { reportId, gaId } = req.query as Record<string, string>;
    let result = corrections;

    if (reportId) result = result.filter((c) => c.reportId === reportId);
    if (gaId) result = result.filter((c) => c.gaId === gaId);

    res.json({ ok: true, corrections: result, total: result.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '查询纠错异常');
    res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

export default router;
