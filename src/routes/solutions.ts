/**
 * routes/solutions.ts — 方案管理 API (Phase 3.4)
 *
 * POST   /api/solutions/generate   — 从诊断报告生成方案
 * GET    /api/solutions            — 查询方案列表
 * GET    /api/solutions/:id        — 查询单个方案
 * PUT    /api/solutions/:id/status — 状态流转
 * POST   /api/solutions/:id/push   — 推送方案给对接人
 *
 * 铁律 24+31: 每步独立 try/catch, degraded 传播。
 * 铁律 38: 禁用不安全类型断言。
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
import { extractAuthFromRequest } from '../middleware/auth';
import {
  generateSolutions,
  getSolutions,
  getSolutionById,
  updateSolutionStatus,
  pushToLiaison,
  VALID_SOLUTION_STATUSES,
} from '../services/solution-generator';
import type { SolutionStatus, RecommendationInput } from '../services/solution-generator';

const log = createLogger('routes/solutions');
const router = Router();

// ═══ 辅助函数 ═══

function getTeamId(req: Request): string {
  const auth = extractAuthFromRequest(req);
  return auth?.orgId || 'default';
}

function requireAuth(req: Request, res: Response): boolean {
  const auth = extractAuthFromRequest(req);
  if (!auth) {
    res.status(401).json({ ok: false, code: 'UNAUTHORIZED' });
    return false;
  }
  return true;
}

function requireGaOrAdmin(req: Request, res: Response): boolean {
  const auth = extractAuthFromRequest(req);
  if (!auth) {
    res.status(401).json({ ok: false, code: 'UNAUTHORIZED' });
    return false;
  }
  if (auth.role !== 'ga' && auth.role !== 'admin') {
    res.status(403).json({ ok: false, code: 'FORBIDDEN' });
    return false;
  }
  return true;
}

// ═══ POST /api/solutions/generate — 从诊断报告生成方案 ═══

router.post('/api/solutions/generate', async (req: Request, res: Response) => {
  try {
    if (!requireGaOrAdmin(req, res)) return;

    const { reportId, sentinelIds, recommendations } = req.body as Record<string, unknown>;

    if (!reportId || typeof reportId !== 'string') {
      res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'reportId 必填' });
      return;
    }

    const teamId = getTeamId(req);
    const recs = (recommendations as RecommendationInput[]) || [];
    const sids = (sentinelIds as string[]) || [];

    const result = await generateSolutions(reportId, teamId, recs, sids);

    res.status(201).json({
      ok: true,
      solutions: result.solutions,
      degraded: result.degraded,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, '生成方案异常');
    res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// ═══ GET /api/solutions — 查询方案列表 ═══

router.get('/api/solutions', async (req: Request, res: Response) => {
  try {
    if (!requireAuth(req, res)) return;

    const reportId = req.query.reportId as string | undefined;
    const teamId = getTeamId(req);

    const result = await getSolutions(reportId, teamId);

    res.json({
      ok: true,
      solutions: result.solutions,
      degraded: result.degraded,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, '查询方案列表异常');
    res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// ═══ GET /api/solutions/:id — 查询单个方案 ═══

router.get('/api/solutions/:id', async (req: Request, res: Response) => {
  try {
    if (!requireAuth(req, res)) return;

    const id = String(req.params.id);
    const result = await getSolutionById(id);

    if (!result.solution) {
      res.status(404).json({ ok: false, code: 'NOT_FOUND' });
      return;
    }

    res.json({ ok: true, solution: result.solution, degraded: result.degraded });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, '查询方案异常');
    res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// ═══ PUT /api/solutions/:id/status — 状态流转 ═══

router.put('/api/solutions/:id/status', async (req: Request, res: Response) => {
  try {
    if (!requireGaOrAdmin(req, res)) return;

    const id = String(req.params.id);
    const { status } = req.body as { status?: string };

    if (!status || !(VALID_SOLUTION_STATUSES as readonly string[]).includes(status)) {
      res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        message: `status 必须为: ${VALID_SOLUTION_STATUSES.join(', ')}`,
      });
      return;
    }

    const result = await updateSolutionStatus(id, status as SolutionStatus);

    if (!result.success) {
      res.status(400).json({ ok: false, code: 'INVALID_TRANSITION', degraded: result.degraded });
      return;
    }

    res.json({ ok: true, status, degraded: result.degraded });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, '更新方案状态异常');
    res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// ═══ POST /api/solutions/:id/push — 推送方案给对接人 ═══

router.post('/api/solutions/:id/push', async (req: Request, res: Response) => {
  try {
    if (!requireGaOrAdmin(req, res)) return;

    const id = String(req.params.id);
    const { channels } = req.body as { channels?: string[] };

    const result = await pushToLiaison(id, channels || ['electron']);

    res.json({
      ok: result.pushed,
      note: result.note,
      degraded: result.degraded,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, '推送方案异常');
    res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

export default router;
