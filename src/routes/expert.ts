/**
 * routes/expert.ts — 行业专家贡献 REST API (Phase 4.2a)
 *
 * POST /api/expert/contribute — 提交行业知识
 * GET  /api/expert/templates/:id — 查看模板状态
 * GET  /api/expert/mine?expertId=... — 我的贡献列表
 * GET  /api/expert/marketplace?industry=... — 按行业浏览模板
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '../logger';
import { TemplateValidator } from '../expert-platform/validator';

const router = Router();
const log = createLogger('routes/expert');

// ═══ In-memory stores (replace with SQLite in production) ═══

interface ContributionEntry {
  id: string;
  expertId: string;
  industry: string;
  scenario: string;
  description: string;
  status: 'submitted' | 'extracted' | 'validated' | 'published';
  template?: { symptom: string; rootCause: string; edgeType: string; confidence: number };
  submittedAt: string;
}

const contributions = new Map<string, ContributionEntry>();
const validator = new TemplateValidator();

// ═══ Routes ═══

/** POST /api/expert/contribute */
router.post('/api/expert/contribute', (req: Request, res: Response) => {
  const { expertId, industry, scenario, description, yearsOfExperience } = req.body;

  if (!expertId || !industry || !scenario || !description) {
    return res.status(400).json({
      ok: false, error: '缺少必填字段: expertId, industry, scenario, description',
      code: 'VALIDATION_ERROR',
    });
  }

  const id = `contrib_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const entry: ContributionEntry = {
    id, expertId, industry, scenario, description,
    status: description.length > 20 ? 'extracted' : 'submitted',
    submittedAt: new Date().toISOString(),
  };

  // Auto-extract template (simple heuristic)
  if (entry.status === 'extracted') {
    entry.template = {
      symptom: scenario.replace(/_/g, ' '),
      rootCause: description.slice(0, 60),
      edgeType: 'TRIGGERS',
      confidence: Math.min(0.9, 0.5 + (yearsOfExperience || 0) * 0.02),
    };
  }

  contributions.set(id, entry);
  log.info({ id, expertId, industry, scenario }, '专家贡献已提交');

  res.json({ ok: true, id, status: entry.status, template: entry.template });
});

/** GET /api/expert/templates/:id */
router.get('/api/expert/templates/:id', (req: Request, res: Response) => {
  const entry = contributions.get(req.params.id);
  if (!entry) {
    return res.status(404).json({ ok: false, error: '模板不存在', code: 'NOT_FOUND' });
  }
  const statuses = validator.getAllStatuses();
  res.json({ ok: true, entry, validationStatus: statuses[req.params.id] || 'unvalidated' });
});

/** GET /api/expert/mine */
router.get('/api/expert/mine', (req: Request, res: Response) => {
  const expertId = req.query.expertId as string;
  if (!expertId) {
    return res.status(400).json({ ok: false, error: '缺少 expertId 参数' });
  }

  const mine: ContributionEntry[] = [];
  for (const entry of contributions.values()) {
    if (entry.expertId === expertId) mine.push(entry);
  }

  res.json({ ok: true, count: mine.length, contributions: mine });
});

/** GET /api/expert/marketplace */
router.get('/api/expert/marketplace', (req: Request, res: Response) => {
  const industry = req.query.industry as string;
  const entries: ContributionEntry[] = [];

  for (const entry of contributions.values()) {
    if (entry.status !== 'published' && entry.status !== 'validated') continue;
    if (industry && entry.industry !== industry) continue;
    entries.push(entry);
  }

  res.json({
    ok: true,
    industry: industry || 'all',
    count: entries.length,
    templates: entries.slice(0, 20),
  });
});

export default router;
